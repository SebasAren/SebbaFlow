/**
 * Tracing module — OpenTelemetry tracing via Langfuse.
 *
 * Provides a singleton `initTracing()` that lazily initializes the
 * OpenTelemetry SDK with LangfuseSpanProcessor when Langfuse credentials
 * are available (LANGFUSE_* env vars, or a "langfuse" entry in pi's
 * auth.json). When neither is present, returns no-op stubs that safely
 * swallow all calls (no throwing, no memory leaks).
 *
 * Usage:
 *   const { startObservation } = initTracing();
 *   const span = startObservation("my-operation", { input: { ... } });
 *   // ... do work ...
 *   span.update({ output: { ... } });
 *   span.end();
 */

import { spawnSync } from "node:child_process";
import {
  propagateAttributes,
  startObservation as langfuseStartObservation,
} from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { readAuthEntries } from "./api-key";

// ── Types ─────────────────────────────────────────────────────────────────

/** Minimal observation shape compatible with Langfuse span/tool/generation. */
export interface ObservationLike {
  update: (attrs: Record<string, unknown>) => ObservationLike;
  end: () => void;
  startObservation: (
    name: string,
    attrs?: Record<string, unknown>,
    opts?: { asType?: string },
  ) => ObservationLike;
}

/** Return type of initTracing(). */
export interface TracingInstance {
  startObservation: (
    name: string,
    attrs?: Record<string, unknown>,
    opts?: { asType?: string },
  ) => ObservationLike;
}

// ── No-op stubs ───────────────────────────────────────────────────────────

const noopSpan: ObservationLike = {
  update: () => noopSpan,
  end: () => {},
  startObservation: () => noopSpan,
};

const noopStartObservation = (): ObservationLike => noopSpan;

const noopTracing: TracingInstance = {
  startObservation: noopStartObservation,
};

// ── Singleton state (cached per mode) ─────────────────────────────────────

let realTracing: TracingInstance | undefined;

// ── Helper ─────────────────────────────────────────────────────────────────

export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  host: string;
}

/**
 * Resolve Langfuse credentials: env vars first, then the "langfuse" entry
 * in pi's auth.json (`key` = public key, `env` = secret + host).
 * Returns undefined when not fully configured — tracing stays off.
 */
function resolveLangfuseConfig(): LangfuseConfig | undefined {
  const entry = readAuthEntries()["langfuse"];
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY || entry?.key;
  const secretKey = process.env.LANGFUSE_SECRET_KEY || entry?.env?.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST || entry?.env?.LANGFUSE_HOST;
  return publicKey && secretKey && host ? { publicKey, secretKey, host } : undefined;
}

// ── Real tracer initialization ────────────────────────────────────────────

let sdk: NodeSDK | undefined;

function initRealTracing(config: LangfuseConfig): TracingInstance {
  if (realTracing) return realTracing;

  sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.host,
      }),
    ],
  });

  try {
    sdk.start();
  } catch {
    // Langfuse SDK warns but doesn't throw on missing env vars in the processor.
    // Guard against unexpected initialization errors.
  }

  realTracing = {
    startObservation: langfuseStartObservation as TracingInstance["startObservation"],
  };

  return realTracing;
}

// ── Branch resolution (cached per cwd) ──────────────────────────────────

const cachedBranches = new Map<string, string>();
const BRANCH_UNKNOWN = "unknown";

/**
 * Resolve the current git branch name, cached per cwd so that exploring
 * multiple repos in the same process gets correct branch for each.
 * Falls back to "unknown" on any error (no git repo, ENOENT, etc.).
 */
function getBranch(cwd: string): string {
  const cached = cachedBranches.get(cwd);
  if (cached) return cached;

  try {
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "buffer",
    });
    if (result.status === 0 && result.stdout && result.stdout.length > 0) {
      const branch = result.stdout.toString().trim();
      cachedBranches.set(cwd, branch);
      return branch;
    }
  } catch {
    // fall through to unknown
  }

  cachedBranches.set(cwd, BRANCH_UNKNOWN);
  return BRANCH_UNKNOWN;
}

// ── Public API ────────────────────────────────────────────────────────────

/** Return type of subagent trace helpers. */
export interface SubagentTraceResult {
  /** The root observation span for the subagent call. */
  observation: ObservationLike;
  /**
   * Create a child observation under the root.
   * Pass name and optional attributes (e.g., { input, metadata }).
   */
  child: (name: string, attrs?: Record<string, unknown>) => ObservationLike;
}

/**
 * Create a root trace observation for any subagent.
 *
 * Calls initTracing() internally, resolves the git branch, and creates a
 * root span with the given name. The query, cwd, model, and branch are
 * attached as attributes. Returns the observation and a child helper.
 *
 * When `sessionId` is provided, the observation is created inside a
 * Langfuse session so that parallel calls are grouped together in the
 * Langfuse UI.
 */
export function startSubagentTrace(
  name: string,
  query: string,
  cwd: string,
  model: string,
  sessionId?: string,
): SubagentTraceResult {
  const tracing = initTracing();
  const branch = getBranch(cwd);

  const attrs = {
    input: { query },
    metadata: { cwd, model, branch },
  };

  let observation!: ObservationLike;
  if (sessionId) {
    propagateAttributes({ sessionId }, () => {
      observation = tracing.startObservation(name, attrs);
    });
  } else {
    observation = tracing.startObservation(name, attrs);
  }

  const child = (childName: string, childAttrs?: Record<string, unknown>): ObservationLike =>
    observation.startObservation(childName, childAttrs);

  return { observation, child };
}

/**
 * Return type of startExploreTrace().
 *
 * @deprecated Use {@link SubagentTraceResult} instead.
 */
export type ExploreTraceResult = SubagentTraceResult;

/**
 * Create a root explore trace observation.
 *
 * Convenience wrapper around {@link startSubagentTrace} that hardcodes the
 * span name to "explore". When `sessionId` is provided, the observation is
 * created inside a Langfuse session.
 */
export function startExploreTrace(
  query: string,
  cwd: string,
  model: string,
  sessionId?: string,
): ExploreTraceResult {
  return startSubagentTrace("explore", query, cwd, model, sessionId);
}

/**
 * Initialize tracing (lazy singleton).
 *
 * Returns a no-op tracer when Langfuse credentials are not fully configured
 * (env vars or auth.json). Otherwise initializes the OpenTelemetry
 * SDK with LangfuseSpanProcessor and returns the real Langfuse SDK binding.
 *
 * The real tracer is a singleton: the SDK is initialized only once.
 * The no-op path returns a shared constant directly — no lazy-init wrappers needed.
 *
 * Safe to call multiple times — only initializes SDK once.
 */
export function initTracing(): TracingInstance {
  const config = resolveLangfuseConfig();
  if (config) {
    return initRealTracing(config);
  }

  return noopTracing;
}
