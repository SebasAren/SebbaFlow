/**
 * Factory extension configuration — base URL and token resolution.
 *
 * Precedence: FACTORY_BASE_URL / FACTORY_TOKEN env vars, then the "factory"
 * entry in pi's auth.json (`{ "type": "api", "key": "...", "baseUrl": "..." }`),
 * then the default local Factory dev server.
 */

import { readAuthEntries, type AuthCredential } from "@pi-ext/shared";

export const DEFAULT_BASE_URL = "http://localhost:4111";

export type FactoryAuthEntry = AuthCredential & { baseUrl?: string };

export interface FactoryConfig {
  baseUrl: string;
  token?: string;
}

export function resolveFactoryConfig(
  env: Record<string, string | undefined> = process.env,
  authEntries: Record<string, AuthCredential> = readAuthEntries(),
): FactoryConfig {
  const entry = authEntries.factory as FactoryAuthEntry | undefined;
  const baseUrl = env.FACTORY_BASE_URL?.trim() || entry?.baseUrl?.trim() || DEFAULT_BASE_URL;
  const token = env.FACTORY_TOKEN || entry?.key;
  return token ? { baseUrl, token } : { baseUrl };
}
