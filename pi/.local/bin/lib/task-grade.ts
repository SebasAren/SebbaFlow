/**
 * task-grade — classify a coding task's complexity to pick a worker model.
 *
 * Used by the supervisor skill before spawning pi workers: fresh worker
 * sessions have no prompt cache, so per-task model routing is free. Asks
 * TypeSafe's Jev classifier (via OpenRouter's System One endpoint) whether
 * the task needs a strong model or a fast one. Any failure — missing key,
 * HTTP error, unusable answer — resolves to the flash model: grading must
 * never block a spawn.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_FLASH_MODEL = "zai/glm-5.3-flash";
export const DEFAULT_PRO_MODEL = "zai/glm-5.3";
export const DEFAULT_CLASSIFIER = "~typesafe/jev-latest";

const ENDPOINT = "https://openrouter.ai/api/v1/systemone";

/**
 * Route to pro when the classifier's P(pro) crosses this. Borderline cases
 * go to pro: overspending on a simple task costs cents; a flash attempt at
 * a hard task costs a failed worker run.
 */
const PRO_PROBABILITY_THRESHOLD = 0.5;

/** The static grading rubric, sent as one choice question. */
export function buildQuestion(): {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
} {
  return {
    type: "choice",
    instructions:
      "How much model capability does this coding task need? Judge from the task text alone.",
    criteria: {
      flash:
        "Well-specified, mechanical, or narrow work: typo or config fix, lint/format cleanup, small refactor with a clear target, test additions, doc updates, dependency bumps, single-file changes following an existing pattern",
      pro: "Work that needs design judgment or broad context: new features with open questions, API or architecture decisions, ambiguous requirements, cross-cutting multi-file changes, tricky concurrency or state, security-sensitive changes",
    },
  };
}

/** Minimal shape of a choice answer we consume. */
interface ChoiceAnswer {
  type?: string;
  choice?: unknown;
  probabilities?: Record<string, unknown>;
}

/**
 * Turn a classifier answer into a grade. Probability wins over the choice
 * label; when probabilities are missing the label stands (probability 1/0
 * reflects certainty by label only). Returns undefined for unusable answers.
 */
export function pickGrade(
  answer: unknown,
): { grade: "flash" | "pro"; probability: number } | undefined {
  if (!answer || typeof answer !== "object") return undefined;
  const a = answer as ChoiceAnswer;
  const proProb = a.probabilities?.pro;
  if (typeof proProb === "number" && Number.isFinite(proProb)) {
    return {
      grade: proProb > PRO_PROBABILITY_THRESHOLD ? "pro" : "flash",
      probability: proProb,
    };
  }
  if (a.choice === "pro") return { grade: "pro", probability: 1 };
  if (a.choice === "flash") return { grade: "flash", probability: 0 };
  return undefined;
}

/**
 * Resolve the OpenRouter API key: OPENROUTER_API_KEY env var first, then
 * the openrouter entry in pi's auth.json. Silent — undefined when neither
 * source has a key.
 */
export function resolveApiKey(
  env: Record<string, string | undefined>,
  authPath: string,
): string | undefined {
  const fromEnv = env.OPENROUTER_API_KEY;
  if (fromEnv) return fromEnv;
  try {
    const parsed: unknown = JSON.parse(readFileSync(authPath, "utf-8"));
    const key = (parsed as { openrouter?: { key?: unknown } } | null)
      ?.openrouter?.key;
    return typeof key === "string" && key ? key : undefined;
  } catch {
    return undefined;
  }
}

/** auth.json location: $PI_AGENT_DIR/auth.json, default ~/.pi/agent/auth.json. */
export function defaultAuthPath(
  env: Record<string, string | undefined> = process.env,
): string {
  return join(env.PI_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "auth.json");
}

export interface GradeOptions {
  flashModel?: string;
  proModel?: string;
  classifier?: string;
  apiKey?: string;
  /** Environment to read (defaults to process.env); injectable for tests. */
  env?: Record<string, string | undefined>;
  /** auth.json path (defaults to defaultAuthPath); injectable for tests. */
  authPath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GradeResult {
  /** Model id to pass to `herdr agent start --model`. */
  model: string;
  grade: "flash" | "pro";
  /** P(pro) from the classifier (1/0 when derived from the label alone). */
  probability: number;
  /** True when the classifier could not be used and flash was assumed. */
  fallback: boolean;
  /** Why the fallback fired. */
  reason?: string;
  /** Dated snapshot id of the classifier that answered. */
  classifier?: string;
  /** Reported cost of the classify call in USD, when present. */
  cost?: number;
}

/**
 * Grade a task text and pick a model. Never throws: failures produce a
 * fallback result on the flash model.
 */
export async function gradeTask(
  task: string,
  opts: GradeOptions = {},
): Promise<GradeResult> {
  const flashModel = opts.flashModel ?? DEFAULT_FLASH_MODEL;
  const proModel = opts.proModel ?? DEFAULT_PRO_MODEL;
  const fail = (reason: string): GradeResult => ({
    model: flashModel,
    grade: "flash",
    probability: 0,
    fallback: true,
    reason,
  });

  const env = opts.env ?? process.env;
  const apiKey =
    opts.apiKey ?? resolveApiKey(env, opts.authPath ?? defaultAuthPath(env));
  if (!apiKey) {
    return fail(
      "no OpenRouter API key (set OPENROUTER_API_KEY or add an openrouter entry to auth.json)",
    );
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.classifier ?? DEFAULT_CLASSIFIER,
        state: { task },
        questions: { grade: buildQuestion() },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) return fail(`classifier HTTP ${res.status}`);

    const data = (await res.json()) as {
      model?: string;
      answers?: { grade?: unknown };
      usage?: { cost?: number };
    };
    const picked = pickGrade(data.answers?.grade);
    if (!picked) return fail("classifier returned an unusable answer");

    return {
      model: picked.grade === "pro" ? proModel : flashModel,
      grade: picked.grade,
      probability: picked.probability,
      fallback: false,
      classifier: data.model,
      cost: data.usage?.cost,
    };
  } catch (err) {
    return fail(
      `classifier call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
