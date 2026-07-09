import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface VerifyConfig {
  verify: string[];
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
