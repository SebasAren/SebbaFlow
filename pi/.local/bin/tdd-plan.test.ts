/**
 * tdd-plan CLI tests
 *
 * Characterization tests locking the current external behavior of every
 * command (create, show, list, phase, complete, note, archive, edit, steps
 * parser) plus the design-command suite. All tests run the CLI via execSync in
 * an isolated TEST_DIR so no real .pi/plans are touched.
 *
 * These exist as a safety net before refactoring the single-file CLI into
 * modules: if behavior changes, these fail.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const CLI = join(import.meta.dir, "tdd-plan");
const TEST_DIR = join(import.meta.dir, ".test-plans");
const PLANS_DIR = join(TEST_DIR, ".pi", "plans");
const ARCHIVE_DIR = join(PLANS_DIR, "archive");

const ONE_STEP_JSON =
  '[{"name":"Step 1: Token","red":"test jwt","green":"impl jwt","refactor":""}]';

function run(args: string, env?: Record<string, string>) {
  try {
    const result = execSync(`${CLI} ${args}`, {
      cwd: TEST_DIR,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout: result, stderr: "" };
  } catch (e: any) {
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

function readPlanJson(slug: string) {
  const path = join(PLANS_DIR, `${slug}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function readArchivedJson(slug: string) {
  const path = join(ARCHIVE_DIR, `${slug}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeStepsFile(name: string, content: string): string {
  const path = join(TEST_DIR, name);
  writeFileSync(path, content);
  return path;
}

beforeAll(() => {
  mkdirSync(PLANS_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(PLANS_DIR)) rmSync(PLANS_DIR, { recursive: true });
  mkdirSync(PLANS_DIR, { recursive: true });
});

// ---------------------------------------------------------------------------

describe("tdd-plan create", () => {
  test("creates a plan with correct JSON shape from --steps JSON", () => {
    const result = run(
      `create auth --title "Auth System" --steps '${ONE_STEP_JSON}'`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Created plan: auth");

    const plan = readPlanJson("auth");
    expect(plan).not.toBeNull();
    expect(plan.title).toBe("Auth System");
    expect(plan.slug).toBe("auth");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].index).toBe(1);
    expect(plan.steps[0].name).toBe("Step 1: Token");
    expect(plan.steps[0].red).toEqual({
      description: "test jwt",
      status: "not_started",
    });
    expect(plan.steps[0].green).toEqual({
      description: "impl jwt",
      status: "not_started",
    });
    expect(plan.steps[0].refactor).toEqual({
      description: "",
      status: "not_started",
    });
    expect(plan.steps[0].completed).toBe(false);
    expect(Array.isArray(plan.notes)).toBe(true);
  });

  test("stores --context, --architecture, and --notes", () => {
    run(
      `create auth --title "Auth" --steps '${ONE_STEP_JSON}' --context "ctx" --architecture "arch" --notes '["n1","n2"]'`,
    );
    const plan = readPlanJson("auth");
    expect(plan.context).toBe("ctx");
    expect(plan.architecture).toBe("arch");
    expect(plan.notes).toEqual(["n1", "n2"]);
  });

  test("fails if slug already exists", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("already exists");
  });

  test("fails without --title", () => {
    const result = run(`create auth --steps '${ONE_STEP_JSON}'`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--title is required");
  });

  test("reads steps from --steps-file", () => {
    const file = writeStepsFile("steps.json", ONE_STEP_JSON);
    const result = run(`create auth --title "Auth" --steps-file ${file}`);
    expect(result.exitCode).toBe(0);
    const plan = readPlanJson("auth");
    expect(plan.steps[0].name).toBe("Step 1: Token");
  });
});

describe("tdd-plan steps parser (text format)", () => {
  test("parses STEP/RED/GREEN/REFACTOR text into steps", () => {
    const text = `STEP 1: Token generation
RED: Write test that generates a JWT
GREEN: Implement token generation
REFACTOR: Extract signer helper
---
STEP 2: Add column
RED: none
GREEN: Add migration
REFACTOR:`;
    const file = writeStepsFile("steps.txt", text);
    const result = run(`create migrate --title "Migrate" --steps-file ${file}`);
    expect(result.exitCode).toBe(0);
    const plan = readPlanJson("migrate");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].name).toBe("Token generation");
    expect(plan.steps[0].red.description).toBe(
      "Write test that generates a JWT",
    );
    expect(plan.steps[0].green.description).toBe("Implement token generation");
    expect(plan.steps[0].refactor.description).toBe("Extract signer helper");
    expect(plan.steps[1].name).toBe("Add column");
    expect(plan.steps[1].refactor.description).toBe("");
  });

  test("fails when a step is missing required fields", () => {
    const text = `STEP 1: Bad step
RED: only red, no green`;
    const file = writeStepsFile("bad.txt", text);
    const result = run(`create bad --title "Bad" --steps-file ${file}`);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("missing required fields");
  });
});

describe("tdd-plan show", () => {
  test("shows a plan by slug with title and status", () => {
    run(`create auth --title "Auth System" --steps '${ONE_STEP_JSON}'`);
    const result = run("show auth");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Auth System");
    expect(result.stdout).toContain("Status:");
    expect(result.stdout).toContain("Progress: 0/1");
  });

  test("with no slug defaults to most recently modified plan", () => {
    run(`create alpha --title "Alpha" --steps '${ONE_STEP_JSON}'`);
    run(`create beta --title "Beta" --steps '${ONE_STEP_JSON}'`);
    const result = run("show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Beta");
  });

  test("reports no plans when none exist", () => {
    const result = run("show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No plans found");
  });
});

describe("tdd-plan list", () => {
  test("reports no plans when empty", () => {
    const result = run("list");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No plans found");
  });

  test("lists plans with slug, title, and progress", () => {
    run(`create auth --title "Auth System" --steps '${ONE_STEP_JSON}'`);
    const result = run("list");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("auth");
    expect(result.stdout).toContain("Auth System");
    expect(result.stdout).toContain("(0/1)");
  });
});

describe("tdd-plan phase", () => {
  test("start sets phase to in_progress", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("phase auth 1 red start");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("RED started");
    const plan = readPlanJson("auth");
    expect(plan.steps[0].red.status).toBe("in_progress");
  });

  test("done sets phase to done", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run("phase auth 1 green done");
    const plan = readPlanJson("auth");
    expect(plan.steps[0].green.status).toBe("done");
  });

  test("skip sets phase to skipped", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run("phase auth 1 refactor skip");
    const plan = readPlanJson("auth");
    expect(plan.steps[0].refactor.status).toBe("skipped");
  });

  test("rejects invalid phase", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("phase auth 1 purple start");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("phase must be one of");
  });

  test("rejects invalid action", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("phase auth 1 red frobnicate");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("action must be start, done, or skip");
  });

  test("rejects out-of-range step", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("phase auth 9 red start");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });
});

describe("tdd-plan complete", () => {
  test("marks step completed and phases done", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("complete auth 1");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("complete ✅");
    const plan = readPlanJson("auth");
    expect(plan.steps[0].completed).toBe(true);
    expect(plan.steps[0].red.status).toBe("done");
    expect(plan.steps[0].green.status).toBe("done");
  });

  test("preserves skipped refactor on complete", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run("phase auth 1 refactor skip");
    run("complete auth 1");
    const plan = readPlanJson("auth");
    expect(plan.steps[0].refactor.status).toBe("skipped");
  });
});

describe("tdd-plan note", () => {
  test("appends a note to the plan", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("note auth something important");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added note to auth");
    const plan = readPlanJson("auth");
    expect(plan.notes).toContain("something important");
  });
});

describe("tdd-plan archive", () => {
  test("moves plan to archive directory", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    const result = run("archive auth");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Archived plan: auth");
    expect(readPlanJson("auth")).toBeNull();
    expect(readArchivedJson("auth")).not.toBeNull();
  });

  test("fails on nonexistent plan", () => {
    const result = run("archive ghost");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });
});

describe("tdd-plan edit", () => {
  test("updates title", () => {
    run(`create auth --title "Old" --steps '${ONE_STEP_JSON}'`);
    run(`edit auth --title "New Title"`);
    const plan = readPlanJson("auth");
    expect(plan.title).toBe("New Title");
  });

  test("replaces steps and resets their status", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run("phase auth 1 red start");
    const newSteps =
      '[{"name":"Step 1: Fresh","red":"r","green":"g","refactor":""}]';
    run(`edit auth --steps '${newSteps}'`);
    const plan = readPlanJson("auth");
    expect(plan.steps[0].name).toBe("Step 1: Fresh");
    expect(plan.steps[0].red.status).toBe("not_started");
  });

  test("updates notes", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run(`edit auth --notes '["updated"]'`);
    const plan = readPlanJson("auth");
    expect(plan.notes).toEqual(["updated"]);
  });
});

describe("tdd-plan design", () => {
  test("design create: adds design artifact to existing plan", () => {
    run(`create auth --title "Auth System" --steps '${ONE_STEP_JSON}'`);
    const result = run(
      'design auth --current-state "No auth middleware exists" --desired-state "JWT-based auth on all routes" --patterns "Express middleware pattern from src/middleware/" --decisions "Use RS256 over HS256" --questions "What about refresh token rotation?"',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Design artifact created");

    const plan = readPlanJson("auth");
    expect(plan).not.toBeNull();
    expect(plan.design).toBeDefined();
    expect(plan.design.currentState).toBe("No auth middleware exists");
    expect(plan.design.desiredState).toBe("JWT-based auth on all routes");
    expect(plan.design.patterns).toBe(
      "Express middleware pattern from src/middleware/",
    );
    expect(plan.design.decisions).toBe("Use RS256 over HS256");
    expect(plan.design.questions).toBe("What about refresh token rotation?");
  });

  test("design show: displays design artifact for a plan", () => {
    run(`create auth --title "Auth System" --steps '${ONE_STEP_JSON}'`);
    run(
      'design auth --current-state "No auth" --desired-state "Has auth" --patterns "None" --decisions "JWT" --questions "Refresh tokens?"',
    );
    const result = run("design auth --show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## Design Artifact");
    expect(result.stdout).toContain("No auth");
    expect(result.stdout).toContain("Has auth");
    expect(result.stdout).toContain("JWT");
    expect(result.stdout).toContain("Refresh tokens?");
  });

  test("design edit: updates specific fields of existing design", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run(
      'design auth --current-state "Old state" --desired-state "Old desired" --patterns "P1" --decisions "D1" --questions "Q1"',
    );
    const result = run(
      'design auth --desired-state "Updated desired" --questions "New question? Old question resolved: yes."',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Design artifact updated");

    const plan = readPlanJson("auth");
    expect(plan.design.desiredState).toBe("Updated desired");
    expect(plan.design.questions).toBe(
      "New question? Old question resolved: yes.",
    );
    expect(plan.design.currentState).toBe("Old state");
  });

  test("design create without existing plan fails", () => {
    const result = run(
      'design nonexistent --current-state "x" --desired-state "y" --patterns "p" --decisions "d" --questions "q"',
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });

  test("design is included in plan show output", () => {
    run(`create auth --title "Auth" --steps '${ONE_STEP_JSON}'`);
    run(
      'design auth --current-state "No auth" --desired-state "Has auth" --patterns "MW pattern" --decisions "JWT" --questions "Refresh?"',
    );
    const result = run("show auth");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## Design Artifact");
    expect(result.stdout).toContain("No auth");
  });
});

describe("tdd-plan phase green-done verify gate", () => {
  const CONFIG = join(TEST_DIR, ".pi", "config.json");

  function writeVerifyConfig(commands: string[]) {
    writeFileSync(CONFIG, JSON.stringify({ verify: commands }));
  }

  // The top-level afterEach wipes .pi/plans; also clear any verify config so
  // it cannot leak between gate tests or into the other describe blocks.
  afterEach(() => {
    if (existsSync(CONFIG)) rmSync(CONFIG);
  });

  test("green done writes plan and exits 0 when verify passes", () => {
    run(`create gate --title "Gate" --steps '${ONE_STEP_JSON}'`);
    writeVerifyConfig(["echo all-good"]);
    const result = run("phase gate 1 green done");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Verify passed");
    const plan = readPlanJson("gate");
    expect(plan.steps[0].green.status).toBe("done");
  });

  test("green done stays in_progress and skips the write when verify fails", () => {
    run(`create gate --title "Gate" --steps '${ONE_STEP_JSON}'`);
    run("phase gate 1 green start"); // mark in_progress first
    writeVerifyConfig(["false"]);
    const result = run("phase gate 1 green done");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Verify failed");
    // plan on disk must NOT have advanced to done
    const plan = readPlanJson("gate");
    expect(plan.steps[0].green.status).toBe("in_progress");
  });

  test("green done skips the gate with a warning when no config exists", () => {
    run(`create gate --title "Gate" --steps '${ONE_STEP_JSON}'`);
    const result = run("phase gate 1 green done");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skipping");
    const plan = readPlanJson("gate");
    expect(plan.steps[0].green.status).toBe("done");
  });
});
