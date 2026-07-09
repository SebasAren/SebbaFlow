import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface VerifyConfig {
  verify: string[];
}

export interface VerifyResult {
  ok: boolean;
  output: string;
}

/**
 * Load the verify command list from `<cwd>/.pi/config.json` (`{ "verify": [...] }`).
 *
 * Returns an empty array when the file is absent or malformed, so the tool
 * stays portable to repos without a verify config (the green gate is then
 * skipped with a warning).
 */
export function loadVerifyConfig(cwd: string): string[] {
  const configPath = join(cwd, ".pi", "config.json");
  if (!existsSync(configPath)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return [];
  }

  if (parsed === null || typeof parsed !== "object") return [];
  const verify = (parsed as { verify?: unknown }).verify;
  if (!Array.isArray(verify)) return [];

  return verify.filter((c): c is string => typeof c === "string");
}

/**
 * Run a list of shell command strings, short-circuiting on the first failure.
 *
 * Each command string is split on whitespace into an argv array and executed
 * via spawnSync (no shell, so no escaping is needed). Combined stdout + stderr
 * (+ the spawn error message, e.g. ENOENT when the binary is missing) is
 * captured with a `$ <command>` label per command. Returns `ok: false` as
 * soon as one command exits non-zero or fails to spawn.
 */
export function runVerify(commands: string[], cwd: string): VerifyResult {
  const parts: string[] = [];

  for (const raw of commands) {
    const cmd = raw.trim();
    if (!cmd) continue; // skip blank entries

    const argv = cmd.split(/\s+/);
    parts.push(`$ ${cmd}`);

    const result = spawnSync(argv[0], argv.slice(1), {
      cwd,
      encoding: "utf8",
    });

    const stdout = (result.stdout ?? "").trim();
    const stderr = (result.stderr ?? "").trim();
    const errMsg = result.error ? String(result.error.message) : "";
    const combined = [stdout, stderr, errMsg].filter(Boolean).join("\n");
    if (combined) parts.push(combined);

    if (result.status !== 0) {
      return { ok: false, output: parts.join("\n") };
    }
  }

  return { ok: true, output: parts.join("\n") };
}
