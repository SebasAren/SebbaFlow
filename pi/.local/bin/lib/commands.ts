import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { parseArgs } from "./args";
import {
  ARCHIVE_DIR,
  PlanError,
  archivedPath,
  listPlanSlugs,
  mostRecentPlanSlug,
  planPath,
  readPlan,
  writePlan,
} from "./plan-io";
import { deriveStatus, showPlan } from "./render";
import { readStepsFromSource } from "./steps";
import { loadVerifyConfig, runVerify } from "./verify";
import type { DesignArtifact, PhaseName, PhaseStatus, Plan } from "./types";

function buildSteps(
  stepsInput: {
    name: string;
    red?: string;
    green?: string;
    refactor?: string;
  }[],
) {
  return stepsInput.map((s, i) => ({
    index: i + 1,
    name: s.name,
    red: { description: s.red ?? "", status: "not_started" as PhaseStatus },
    green: { description: s.green ?? "", status: "not_started" as PhaseStatus },
    refactor: {
      description: s.refactor ?? "",
      status: "not_started" as PhaseStatus,
    },
    completed: false,
  }));
}

export function cmdCreate(args: string[]): void {
  const slug = args[0];
  if (!slug) {
    throw new PlanError(
      "Usage: tdd-plan create <slug> --title <title> --steps <json> | --steps-file <path>",
    );
  }

  if (existsSync(planPath(slug))) {
    throw new PlanError(`Plan "${slug}" already exists.`);
  }

  const flags = parseArgs(args.slice(1));
  const title = flags.title;

  if (!title) {
    throw new PlanError("Error: --title is required");
  }

  const stepsInput = readStepsFromSource(flags);

  const plan: Plan = {
    title,
    slug,
    context: flags.context ?? "",
    architecture: flags.architecture ?? "",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    steps: buildSteps(stepsInput),
    notes: flags.notes ? JSON.parse(flags.notes) : [],
  };

  writePlan(plan);
  console.log(`Created plan: ${slug}`);
  console.log("");
  showPlan(plan);
}

export function cmdEdit(args: string[]): void {
  const slug = args[0];
  if (!slug) {
    throw new PlanError(
      "Usage: tdd-plan edit <slug> [--title <title>] [--steps <text> | --steps-file <path>] [--context <text>] [--architecture <text>] [--notes <json>]",
    );
  }

  const plan = readPlan(slug);
  const flags = parseArgs(args.slice(1));

  if (flags.title) {
    plan.title = flags.title;
  }
  if (flags.context !== undefined) {
    plan.context = flags.context;
  }
  if (flags.architecture !== undefined) {
    plan.architecture = flags.architecture;
  }

  if (flags["steps-file"] || flags.steps) {
    const stepsInput = readStepsFromSource(flags);
    plan.steps = buildSteps(stepsInput);
  }

  if (flags.notes !== undefined) {
    try {
      plan.notes = JSON.parse(flags.notes);
    } catch {
      throw new PlanError(
        'Error: --notes must be valid JSON array, e.g. [\"note1\",\"note2\"]',
      );
    }
  }

  writePlan(plan);
  console.log(`Updated plan: ${slug}`);
  console.log("");
  showPlan(plan);
}

export function cmdList(): void {
  const slugs = listPlanSlugs();

  if (slugs.length === 0) {
    console.log("No plans found.");
    return;
  }

  for (const slug of slugs) {
    const plan = readPlan(slug);
    const status = deriveStatus(plan);
    const total = plan.steps.length;
    const done = plan.steps.filter((s) => s.completed).length;
    console.log(`  ${slug}  —  ${plan.title}  (${done}/${total})  ${status}`);
  }
}

export function cmdShow(args: string[]): void {
  const slug = args[0];
  if (!slug) {
    const recent = mostRecentPlanSlug();
    if (recent === null) {
      console.log("No plans found.");
      return;
    }
    showPlan(readPlan(recent));
    return;
  }
  showPlan(readPlan(slug));
}

/**
 * Run the configured verify gate before a GREEN phase is marked done.
 *
 * - No verify config (.pi/config.json) -> print a skip warning and proceed.
 * - Verify passes -> print success and proceed.
 * - Verify fails -> throw PlanError (entry exits 1) WITHOUT writing the plan,
 *   so the phase stays in_progress and the agent must fix before re-running.
 */
function gateGreenStep(): void {
  const commands = loadVerifyConfig(process.cwd());
  if (commands.length === 0) {
    console.log(
      "\u26a0 No verify config (.pi/config.json) \u2014 skipping green gate.",
    );
    return;
  }
  const result = runVerify(commands, process.cwd());
  if (result.ok) {
    console.log("\u2713 Verify passed.");
    if (result.output.trim()) console.log(result.output);
    return;
  }
  throw new PlanError(
    `\u2717 Verify failed \u2014 green phase not marked done.\n${result.output}`,
  );
}

export function cmdPhase(args: string[]): void {
  const [slug, stepStr, phaseStr, actionStr] = args;

  if (!slug || !stepStr || !phaseStr || !actionStr) {
    throw new PlanError(
      "Usage: tdd-plan phase <slug> <step> <red|green|refactor> <start|done|skip>",
    );
  }

  const stepNum = Number.parseInt(stepStr, 10);
  if (Number.isNaN(stepNum) || stepNum < 1) {
    throw new PlanError(
      `Error: step must be a positive integer, got "${stepStr}"`,
    );
  }

  const validPhases: PhaseName[] = ["red", "green", "refactor"];
  if (!validPhases.includes(phaseStr as PhaseName)) {
    throw new PlanError(
      `Error: phase must be one of ${validPhases.join(", ")}, got "${phaseStr}"`,
    );
  }
  const phase = phaseStr as PhaseName;

  const validActions: Record<string, PhaseStatus> = {
    start: "in_progress",
    done: "done",
    skip: "skipped",
  };
  if (!(actionStr in validActions)) {
    throw new PlanError(
      `Error: action must be start, done, or skip, got "${actionStr}"`,
    );
  }

  const plan = readPlan(slug);
  const step = plan.steps[stepNum - 1];
  if (!step) {
    throw new PlanError(
      `Error: step ${stepNum} not found (plan has ${plan.steps.length} steps)`,
    );
  }

  const noVerify = args.includes("--no-verify");
  if (phase === "green" && actionStr === "done") {
    if (noVerify) {
      console.log("⚠ verify bypassed (--no-verify)");
    } else {
      gateGreenStep();
    }
  }

  step[phase].status = validActions[actionStr];
  writePlan(plan);

  const statusLabel =
    actionStr === "start"
      ? "started"
      : actionStr === "done"
        ? "done"
        : "skipped";
  console.log(
    `Step ${stepNum}/${plan.steps.length} ${phase.toUpperCase()} ${statusLabel}`,
  );
  console.log(`Status: ${deriveStatus(plan)}`);
}

export function cmdComplete(args: string[]): void {
  const [slug, stepStr] = args;
  if (!slug || !stepStr) {
    throw new PlanError("Usage: tdd-plan complete <slug> <step>");
  }

  const stepNum = Number.parseInt(stepStr, 10);
  if (Number.isNaN(stepNum) || stepNum < 1) {
    throw new PlanError(
      `Error: step must be a positive integer, got "${stepStr}"`,
    );
  }

  const plan = readPlan(slug);
  const step = plan.steps[stepNum - 1];
  if (!step) {
    throw new PlanError(
      `Error: step ${stepNum} not found (plan has ${plan.steps.length} steps)`,
    );
  }

  step.completed = true;
  if (step.red.status !== "done") step.red.status = "done";
  if (step.green.status !== "done") step.green.status = "done";
  if (step.refactor.status !== "done" && step.refactor.status !== "skipped")
    step.refactor.status = "done";

  writePlan(plan);

  const done = plan.steps.filter((s) => s.completed).length;
  console.log(
    `Step ${stepNum}/${plan.steps.length} complete ✅ (${done}/${plan.steps.length} done)`,
  );
  console.log(`Status: ${deriveStatus(plan)}`);
}

export function cmdNote(args: string[]): void {
  const [slug, ...textParts] = args;
  if (!slug || textParts.length === 0) {
    throw new PlanError("Usage: tdd-plan note <slug> <text>");
  }

  const plan = readPlan(slug);
  plan.notes.push(textParts.join(" "));
  writePlan(plan);
  console.log(`Added note to ${slug}`);
}

export function cmdDesign(args: string[]): void {
  const slug = args[0];
  if (!slug) {
    throw new PlanError(
      "Usage: tdd-plan design <slug> [--show] [--current-state <text>] [--desired-state <text>] [--patterns <text>] [--decisions <text>] [--questions <text>]",
    );
  }

  const flags = parseArgs(args.slice(1));

  if (args.includes("--show")) {
    const plan = readPlan(slug);
    if (!plan.design) {
      throw new PlanError(`No design artifact for plan "${slug}".`);
    }
    console.log("## Design Artifact");
    console.log("");
    console.log("**Current State:**", plan.design.currentState);
    console.log("");
    console.log("**Desired End State:**", plan.design.desiredState);
    console.log("");
    console.log("**Patterns to Follow:**", plan.design.patterns);
    console.log("");
    console.log("**Resolved Decisions:**", plan.design.decisions);
    console.log("");
    console.log("**Open Questions:**", plan.design.questions);
    console.log("");
    return;
  }

  const plan = readPlan(slug);

  const existing = plan.design;
  const design: DesignArtifact = {
    currentState: flags["current-state"] ?? existing?.currentState ?? "",
    desiredState: flags["desired-state"] ?? existing?.desiredState ?? "",
    patterns: flags.patterns ?? existing?.patterns ?? "",
    decisions: flags.decisions ?? existing?.decisions ?? "",
    questions: flags.questions ?? existing?.questions ?? "",
  };

  plan.design = design;
  writePlan(plan);

  const action = existing ? "updated" : "created";
  console.log(`Design artifact ${action} for: ${slug}`);
}

export function cmdArchive(args: string[]): void {
  const slug = args[0];
  if (!slug) {
    throw new PlanError("Usage: tdd-plan archive <slug>");
  }

  const src = planPath(slug);
  if (!existsSync(src)) {
    throw new PlanError(`Plan "${slug}" not found.`);
  }

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  renameSync(src, archivedPath(slug));

  const plan = JSON.parse(readFileSync(archivedPath(slug), "utf8")) as Plan;
  plan.updated = new Date().toISOString();
  writeFileSync(archivedPath(slug), JSON.stringify(plan, null, 2) + "\n");

  console.log(`Archived plan: ${slug}`);
}
