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
import { loadVerifyConfig } from "./verify";

describe("loadVerifyConfig", () => {
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
