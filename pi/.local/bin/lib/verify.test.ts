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
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadVerifyConfig, runVerify } from "./verify";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "tdd-verify-"));
  mkdirSync(join(tmp, ".pi"), { recursive: true });
});

afterAll(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true });
});

afterEach(() => {
  const cfg = join(tmp, ".pi", "config.json");
  if (existsSync(cfg)) rmSync(cfg);
});

describe("loadVerifyConfig", () => {
  function writeConfig(obj: unknown) {
    writeFileSync(join(tmp, ".pi", "config.json"), JSON.stringify(obj));
  }

  test("returns the verify array when .pi/config.json is present", () => {
    writeConfig({ verify: ["mise run lint-changed", "mise run typecheck"] });
    expect(loadVerifyConfig(tmp)).toEqual([
      "mise run lint-changed",
      "mise run typecheck",
    ]);
  });

  test("returns an empty array when config is absent", () => {
    expect(loadVerifyConfig(tmp)).toEqual([]);
  });

  test("returns an empty array when config is malformed JSON", () => {
    writeFileSync(join(tmp, ".pi", "config.json"), "{ not valid json");
    expect(loadVerifyConfig(tmp)).toEqual([]);
  });

  test("returns an empty array when verify is missing or not an array", () => {
    writeConfig({ other: "x" });
    expect(loadVerifyConfig(tmp)).toEqual([]);

    writeConfig({ verify: "not-an-array" });
    expect(loadVerifyConfig(tmp)).toEqual([]);
  });

  test("filters out non-string entries", () => {
    writeConfig({ verify: ["ok", 42, null, "also-ok"] });
    expect(loadVerifyConfig(tmp)).toEqual(["ok", "also-ok"]);
  });
});

describe("runVerify", () => {
  test("returns ok true and captures stdout for a passing command", () => {
    const result = runVerify(["echo hi"], tmp);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hi");
  });

  test("returns ok false for a failing command", () => {
    const result = runVerify(["false"], tmp);
    expect(result.ok).toBe(false);
  });

  test("short-circuits on first failure", () => {
    const result = runVerify(["false", "echo never"], tmp);
    expect(result.ok).toBe(false);
    expect(result.output).not.toContain("never");
  });

  test("runs multiple passing commands in order", () => {
    const result = runVerify(["echo one", "echo two"], tmp);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("one");
    expect(result.output).toContain("two");
  });

  test("skips empty command strings", () => {
    const result = runVerify(["", "echo ok"], tmp);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("ok");
  });

  test("surfaces the error message when a command binary is not found", () => {
    const result = runVerify(["no-such-binary-xyz-tdd-plan"], tmp);
    expect(result.ok).toBe(false);
    // The `$ <cmd>` label already echoes the name; assert on the error reason
    // ("not found" / ENOENT), which only appears when result.error is surfaced.
    expect(result.output).toMatch(/not found|ENOENT/i);
  });
});
