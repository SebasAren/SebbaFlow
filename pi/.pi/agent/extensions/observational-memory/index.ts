/**
 * Observational Memory — per-project observation store.
 *
 * Data layer for the observational-memory pipeline: resolves a stable
 * project identity from the git remote (falling back to the git common
 * dir, then cwd) so every worktree of a repo shares one store, and
 * persists observation/reflection groups plus per-thread watermarks as
 * corruption-tolerant JSONL under
 * ~/.config/pi/observational-memory/<project-key>/.
 *
 * Runtime behavior (Observer scheduling, context replacement, recall)
 * lands with the Observer extension (#144); this registration proves the
 * discovery wiring.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function observationalMemoryExtension(_api: ExtensionAPI): void {}
