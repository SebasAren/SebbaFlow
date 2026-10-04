/**
 * API key helpers for extensions that require external API keys.
 *
 * Keys resolve from two sources, in order:
 *
 * 1. An environment variable (keeps CI and test overrides working).
 * 2. pi's built-in credential store — an `api_key` entry in
 *    `<agent-dir>/auth.json` (the file `/login` writes to).
 *
 * Extensions call the soft check (warn + return undefined) during
 * initialization and the hard require (throw on missing) inside
 * tool execute().
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Minimal shape of an auth.json credential entry we consume. */
export interface AuthCredential {
  type?: string;
  key?: string;
  env?: Record<string, string>;
}

/** Cached auth.json contents, keyed by agent dir so tests can retarget it. */
let authCache: { dir: string; entries: Record<string, AuthCredential> } | undefined;

/**
 * Read all credential entries from auth.json.
 *
 * Missing or invalid files resolve to an empty object — callers treat that
 * as "no stored credentials" and fall back to ambient env only.
 */
export function readAuthEntries(): Record<string, AuthCredential> {
  const dir = getAgentDir();
  if (authCache?.dir === dir) return authCache.entries;

  let entries: Record<string, AuthCredential> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, "auth.json"), "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      entries = parsed as Record<string, AuthCredential>;
    }
  } catch {
    // No auth.json or unreadable JSON — no stored credentials.
  }

  authCache = { dir, entries };
  return entries;
}

/**
 * Resolve an API key: environment variable first, then the matching
 * auth.json entry. Silent — returns undefined when neither source has it.
 *
 * @param envVar Environment variable name (highest priority)
 * @param authId Credential id in auth.json (e.g. "exa")
 */
export function resolveApiKey(envVar: string, authId: string): string | undefined {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  const entry = readAuthEntries()[authId];
  return typeof entry?.key === "string" && entry.key ? entry.key : undefined;
}

/** Hint text appended to warnings/errors when both sources are exhausted. */
function sourceHint(envVar: string, authId?: string): string {
  return authId
    ? `Set it via export ${envVar}='your-key' or add {"${authId}": {"type": "api_key", "key": "..."}} to auth.json`
    : `Set it via: export ${envVar}='your-key'`;
}

/**
 * Check for an API key, log a warning if missing, return key or undefined.
 *
 * Use during extension initialization to warn early but allow registration.
 */
export function checkApiKey(name: string, envVar: string, authId?: string): string | undefined {
  const key = authId ? resolveApiKey(envVar, authId) : process.env[envVar];
  if (!key) {
    console.warn(`[${name}] ${envVar} not set. ${sourceHint(envVar, authId)}`);
  }
  return key;
}

/**
 * Assert an API key is present, throwing a helpful error if not.
 *
 * Use inside tool execute() when the key is actually needed.
 */
export function requireApiKey(name: string, envVar: string, authId?: string): string {
  const key = authId ? resolveApiKey(envVar, authId) : process.env[envVar];
  if (!key) {
    throw new Error(`${envVar} not set. ${sourceHint(envVar, authId)}`);
  }
  return key;
}
