/**
 * Project identity resolution.
 *
 * Resolves a stable per-project key from a working directory so that every
 * worktree of the same repository shares one observation store:
 *
 * 1. `git remote get-url origin` → normalized remote URL
 * 2. `git rev-parse --git-common-dir` → shared repo dir (worktree-independent)
 * 3. cwd path — final fallback (also covers git refusals like safe.directory)
 *
 * The key is `<slug>-<hash8>` of the identity: human-browsable yet
 * collision-safe. Resolution is memoized per real cwd for the process
 * lifetime (one pi session).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { resolveRealCwd } from "@pi-ext/shared";

export type GitRunner = (
  args: string[],
  cwd: string,
) => { status: number; stdout: string } | undefined;

export type IdentitySource = "origin" | "common-dir" | "cwd";

/**
 * Default git runner. GIT_INDEX_FILE / GIT_DIR / GIT_WORK_TREE are stripped
 * from the environment: when pi runs under the pre-commit hook (or inside
 * test fixtures) these point at an unrelated repo and would silently resolve
 * the wrong project (see explore/file-index.ts for the same hazard).
 */
export const defaultGitRunner: GitRunner = (args, cwd) => {
  const env = { ...process.env };
  delete env.GIT_INDEX_FILE;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  const result = spawnSync("git", args, {
    cwd,
    env,
    timeout: 5000,
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) return undefined;
  return { status: 0, stdout: result.stdout ?? "" };
};

/**
 * Normalize a git remote URL to a canonical identity string:
 * strip protocol, credentials, scp-style host colon, trailing slashes
 * and a trailing `.git`.
 *
 * git@github.com:SebasAren/SebbaFlow.git → github.com/SebasAren/SebbaFlow
 * https://user:token@github.com/o/r.git  → github.com/o/r
 */
export function normalizeRemoteUrl(url: string): string {
  let out = url.trim();
  out = out.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  out = out.replace(/^[^/@]+@/, "");
  const colonIdx = out.indexOf(":");
  if (colonIdx > 1 && !out.includes("://")) {
    // scp-style host:path; colonIdx > 1 skips Windows drive letters
    out = out.slice(0, colonIdx) + "/" + out.slice(colonIdx + 1);
  }
  out = out.replace(/\/+$/, "");
  out = out.replace(/\.git$/i, "");
  return out;
}

/**
 * Resolve the project identity for a working directory. Never throws:
 * any failure (git missing, not a repo, dubious ownership, nonexistent
 * cwd) degrades to the cwd path identity.
 */
export function resolveProjectIdentity(
  cwd: string,
  runGit: GitRunner = defaultGitRunner,
): { identity: string; source: IdentitySource } {
  const realCwd = resolveRealCwd(cwd);
  const git = (args: string[]) => runGit(args, realCwd);

  const origin = git(["remote", "get-url", "origin"]);
  if (origin && origin.stdout.trim()) {
    return { identity: normalizeRemoteUrl(origin.stdout), source: "origin" };
  }

  const commonDir = git(["rev-parse", "--git-common-dir"]);
  if (commonDir && commonDir.stdout.trim()) {
    const dir = resolve(realCwd, commonDir.stdout.trim());
    try {
      return { identity: "path:" + realpathSync(dir), source: "common-dir" };
    } catch {
      // fall through to cwd identity
    }
  }

  try {
    return { identity: "path:" + realpathSync(realCwd), source: "cwd" };
  } catch {
    return { identity: "path:" + realCwd, source: "cwd" };
  }
}

function slugify(identity: string): string {
  const slug = identity
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "project";
}

const keyCache = new Map<string, string>();

/**
 * Stable project key for a working directory: `<slug>-<hash8>` of the
 * identity. Memoized per real cwd — call clearProjectKeyCache() between
 * tests.
 */
export function projectKeyFor(cwd: string, runGit?: GitRunner): string {
  const realCwd = resolveRealCwd(cwd);
  const cached = keyCache.get(realCwd);
  if (cached) return cached;
  const { identity } = resolveProjectIdentity(cwd, runGit);
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 8);
  const key = `${slugify(identity)}-${hash}`;
  keyCache.set(realCwd, key);
  return key;
}

export function clearProjectKeyCache(): void {
  keyCache.clear();
}

export const DEFAULT_STORE_BASE = join(homedir(), ".config", "pi", "observational-memory");

/** Store directory for the project owning `cwd`. */
export function resolveProjectDir(
  cwd: string,
  baseDir: string = DEFAULT_STORE_BASE,
  runGit?: GitRunner,
): string {
  return join(baseDir, projectKeyFor(cwd, runGit));
}
