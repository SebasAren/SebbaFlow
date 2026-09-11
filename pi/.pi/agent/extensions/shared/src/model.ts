/**
 * Get the primary model to use for subagent sessions.
 * Reads from CHEAP_MODEL environment variable.
 * Returns undefined if not set (pi will use its default model).
 */
export function getModel(): string | undefined {
  return process.env.CHEAP_MODEL || undefined;
}

/**
 * Get the fallback model to use when the primary model fails.
 * Reads from FALLBACK_MODEL environment variable.
 * Returns undefined if not set (no fallback available).
 */
export function getFallbackModel(): string | undefined {
  return process.env.FALLBACK_MODEL || undefined;
}

/**
 * Error patterns that indicate the primary model is unavailable
 * and a fallback retry is warranted.
 */
const FALLBACK_ERROR_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /overload/i,
  /too many requests/i,
  /service unavailable/i,
  /503/,
  /502/,
  /500/,
  /internal.?server.?error/i,
  /bad gateway/i,
  /gateway timeout/i,
  /504/,
  /timeout/i,
  /timed.?out/i,
  /connection.?refused/i,
  /connection.?reset/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /upstream[\s_]+(?:\w+[\s_]+)?error/i,
  /server had an error/i,
  /stream ended without finish_reason/i,
  /provider finish_reason: network_error/i,
  /4(?:00|13)\s*(?:status code)?\s*\(no body\)/i,
];

/**
 * Check if an error message indicates the primary model failed
 * in a way that warrants trying the fallback model.
 */
export function shouldUseFallback(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  return FALLBACK_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));
}
