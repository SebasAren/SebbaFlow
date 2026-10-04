import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkApiKey, requireApiKey, resolveApiKey } from "./api-key";

/** Create a temp agent dir with an auth.json and point PI_CODING_AGENT_DIR at it. */
function withAuthFile(entries: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-auth-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "auth.json"), JSON.stringify(entries));
  process.env.PI_CODING_AGENT_DIR = dir;
  return dir;
}

describe("checkApiKey", () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];

  beforeEach(() => {
    warnings.length = 0;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it("returns the key when environment variable is set", () => {
    process.env.TEST_API_KEY_1 = "my-secret-key";
    const result = checkApiKey("my-tool", "TEST_API_KEY_1");
    expect(result).toBe("my-secret-key");
    expect(warnings).toHaveLength(0);
    delete process.env.TEST_API_KEY_1;
  });

  it("returns undefined and warns when environment variable is not set", () => {
    delete process.env.TEST_API_KEY_MISSING_1;
    const result = checkApiKey("my-tool", "TEST_API_KEY_MISSING_1");
    expect(result).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("TEST_API_KEY_MISSING_1");
    expect(warnings[0]).toContain("[my-tool]");
  });

  it("includes the export hint in the warning message", () => {
    delete process.env.TEST_API_KEY_MISSING_2;
    checkApiKey("exa-search", "TEST_API_KEY_MISSING_2");
    expect(warnings[0]).toContain("export TEST_API_KEY_MISSING_2='your-key'");
  });

  it("treats empty string as missing: warns but still returns empty string", () => {
    process.env.TEST_API_KEY_EMPTY = "";
    const result = checkApiKey("tool", "TEST_API_KEY_EMPTY");
    expect(result).toBe("");
    expect(warnings).toHaveLength(1);
    delete process.env.TEST_API_KEY_EMPTY;
  });
});

describe("resolveApiKey", () => {
  const keyVars = ["TEST_RESOLVE_KEY", "TEST_RESOLVE_MISSING"];

  afterEach(() => {
    for (const v of keyVars) delete process.env[v];
    delete process.env.PI_CODING_AGENT_DIR;
  });

  it("prefers the environment variable over the auth.json entry", () => {
    const dir = withAuthFile({ exa: { type: "api_key", key: "auth-key" } });
    process.env.TEST_RESOLVE_KEY = "env-key";
    expect(resolveApiKey("TEST_RESOLVE_KEY", "exa")).toBe("env-key");
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to the auth.json entry when env is unset", () => {
    const dir = withAuthFile({ exa: { type: "api_key", key: "auth-key" } });
    delete process.env.TEST_RESOLVE_KEY;
    expect(resolveApiKey("TEST_RESOLVE_KEY", "exa")).toBe("auth-key");
    rmSync(dir, { recursive: true, force: true });
  });

  it("re-reads auth.json when the agent dir changes", () => {
    const dirA = withAuthFile({ exa: { type: "api_key", key: "key-a" } });
    expect(resolveApiKey("TEST_RESOLVE_MISSING", "exa")).toBe("key-a");
    const dirB = withAuthFile({ exa: { type: "api_key", key: "key-b" } });
    expect(resolveApiKey("TEST_RESOLVE_MISSING", "exa")).toBe("key-b");
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it("returns undefined when neither env nor auth.json has the key", () => {
    const dir = withAuthFile({ other: { type: "api_key", key: "x" } });
    delete process.env.TEST_RESOLVE_MISSING;
    expect(resolveApiKey("TEST_RESOLVE_MISSING", "exa")).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when auth.json is missing entirely", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-auth-empty-"));
    process.env.PI_CODING_AGENT_DIR = dir;
    delete process.env.TEST_RESOLVE_MISSING;
    expect(resolveApiKey("TEST_RESOLVE_MISSING", "exa")).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("checkApiKey with auth.json fallback", () => {
  afterEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.TEST_AUTH_KEY;
  });

  it("returns the auth.json key without warning when env is unset", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    try {
      const dir = withAuthFile({ exa: { type: "api_key", key: "auth-key" } });
      expect(checkApiKey("exa-search", "TEST_AUTH_KEY", "exa")).toBe("auth-key");
      expect(warnings).toHaveLength(0);
      rmSync(dir, { recursive: true, force: true });
    } finally {
      console.warn = originalWarn;
    }
  });

  it("warns mentioning auth.json when both sources are missing", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    try {
      const dir = withAuthFile({});
      expect(checkApiKey("exa-search", "TEST_AUTH_KEY", "exa")).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("auth.json");
      rmSync(dir, { recursive: true, force: true });
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("requireApiKey with auth.json fallback", () => {
  afterEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.TEST_AUTH_KEY;
  });

  it("returns the auth.json key when env is unset", () => {
    const dir = withAuthFile({ context7: { type: "api_key", key: "auth-key" } });
    expect(requireApiKey("context7", "TEST_AUTH_KEY", "context7")).toBe("auth-key");
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws mentioning auth.json when both sources are missing", () => {
    const dir = withAuthFile({});
    expect(() => requireApiKey("context7", "TEST_AUTH_KEY", "context7")).toThrow(/auth\.json/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("requireApiKey", () => {
  it("returns the key when environment variable is set", () => {
    process.env.TEST_API_KEY_2 = "required-key";
    const result = requireApiKey("my-tool", "TEST_API_KEY_2");
    expect(result).toBe("required-key");
    delete process.env.TEST_API_KEY_2;
  });

  it("throws an error when environment variable is not set", () => {
    delete process.env.TEST_API_KEY_MISSING_3;
    expect(() => requireApiKey("my-tool", "TEST_API_KEY_MISSING_3")).toThrow(
      "TEST_API_KEY_MISSING_3 not set",
    );
  });

  it("includes the export hint in the error message", () => {
    delete process.env.TEST_API_KEY_MISSING_4;
    try {
      requireApiKey("context7", "TEST_API_KEY_MISSING_4");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err instanceof Error).toBe(true);
      expect((err as Error).message).toContain("export TEST_API_KEY_MISSING_4='your-key'");
    }
  });

  it("throws when env var is set to empty string", () => {
    process.env.TEST_API_KEY_EMPTY_2 = "";
    expect(() => requireApiKey("tool", "TEST_API_KEY_EMPTY_2")).toThrow(
      "TEST_API_KEY_EMPTY_2 not set",
    );
    delete process.env.TEST_API_KEY_EMPTY_2;
  });
});
