import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  clearProjectKeyCache,
  defaultGitRunner,
  normalizeRemoteUrl,
  projectKeyFor,
  resolveProjectDir,
  resolveProjectIdentity,
  type GitRunner,
} from "./project";

function run(dir: string, args: string[]): void {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf-8",
    // Strip hook/ambient git overrides so fixtures target their own repo.
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_DIR: undefined,
      GIT_WORK_TREE: undefined,
      GIT_INDEX_FILE: undefined,
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

/** Create a temp repo with one commit; returns the repo path. */
function initRepo(origin?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "om-project-"));
  run(dir, ["init", "-q"]);
  run(dir, [
    "-c",
    "user.email=test@example.com",
    "-c",
    "user.name=test",
    "commit",
    "--allow-empty",
    "-q",
    "-m",
    "init",
  ]);
  if (origin) run(dir, ["remote", "add", "origin", origin]);
  return dir;
}

describe("normalizeRemoteUrl", () => {
  it.each([
    ["git@github.com:SebasAren/SebbaFlow.git", "github.com/SebasAren/SebbaFlow"],
    ["https://github.com/SebasAren/SebbaFlow.git", "github.com/SebasAren/SebbaFlow"],
    ["https://github.com/SebasAren/SebbaFlow", "github.com/SebasAren/SebbaFlow"],
    ["https://user:token@github.com/o/r.git", "github.com/o/r"],
    ["ssh://git@github.com/o/r.git", "github.com/o/r"],
    ["git@gitlab.com:group/sub/repo.git/", "gitlab.com/group/sub/repo"],
    ["/srv/git/repo.git", "/srv/git/repo"],
    ["  https://github.com/o/r.git  ", "github.com/o/r"],
  ])("normalizes %s", (url, expected) => {
    expect(normalizeRemoteUrl(url)).toBe(expected);
  });
});

describe("resolveProjectIdentity", () => {
  beforeEach(() => {
    clearProjectKeyCache();
  });

  it("prefers the origin URL when present", () => {
    const repo = initRepo("https://github.com/example/repo.git");
    try {
      const { identity, source } = resolveProjectIdentity(repo);
      expect(source).toBe("origin");
      expect(identity).toBe("github.com/example/repo");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to the git common dir when origin is missing", () => {
    const repo = initRepo();
    try {
      const { identity, source } = resolveProjectIdentity(repo);
      expect(source).toBe("common-dir");
      expect(identity).toBe(`path:${repo}/.git`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to the cwd path outside a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "om-nogit-"));
    try {
      const { identity, source } = resolveProjectIdentity(dir);
      expect(source).toBe("cwd");
      expect(identity).toBe(`path:${dir}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not throw for a nonexistent cwd", () => {
    // resolveRealCwd degrades a nonexistent cwd to the process's real cwd,
    // so resolution succeeds from there — the contract is "never throws".
    const { identity, source } = resolveProjectIdentity("/nonexistent/om-cwd-xyz");
    expect(["origin", "common-dir", "cwd"]).toContain(source);
    expect(identity.length).toBeGreaterThan(0);
  });

  it("ignores GIT_DIR / GIT_WORK_TREE pointing elsewhere", () => {
    const repo = initRepo("https://github.com/example/repo.git");
    const origGitDir = process.env.GIT_DIR;
    const origWorkTree = process.env.GIT_WORK_TREE;
    try {
      process.env.GIT_DIR = "/nonexistent/bogus.git";
      process.env.GIT_WORK_TREE = "/nonexistent";
      const { identity, source } = resolveProjectIdentity(repo);
      expect(source).toBe("origin");
      expect(identity).toBe("github.com/example/repo");
    } finally {
      rmSync(repo, { recursive: true, force: true });
      if (origGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = origGitDir;
      if (origWorkTree === undefined) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = origWorkTree;
    }
  });
});

describe("projectKeyFor", () => {
  let repo: string;
  let worktree: string;

  beforeEach(() => {
    clearProjectKeyCache();
    repo = initRepo("https://github.com/example/worktree-repo.git");
    worktree = join(mkdtempSync(join(tmpdir(), "om-wt-")), "wt");
    run(repo, ["worktree", "add", "-q", worktree]);
  });

  afterEach(() => {
    rmSync(worktree, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
    clearProjectKeyCache();
  });

  it("resolves two worktree cwds of one repo to the same key", () => {
    expect(projectKeyFor(repo)).toBe(projectKeyFor(worktree));
  });

  it("keys are slugged with a hash suffix", () => {
    const key = projectKeyFor(repo);
    expect(key).toMatch(/^github-com-example-worktree-repo-[0-9a-f]{8}$/);
  });

  it("memoizes per cwd", () => {
    let calls = 0;
    const counting: GitRunner = (args, cwd) => {
      calls++;
      return defaultGitRunner(args, cwd);
    };
    const first = projectKeyFor(repo, counting);
    const second = projectKeyFor(repo, counting);
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("memoization is scoped to a project dir override", () => {
    const key = projectKeyFor(repo);
    const dir = resolveProjectDir(repo);
    expect(dir.endsWith(key)).toBe(true);
    const tmpBase = mkdtempSync(join(tmpdir(), "om-base-"));
    try {
      const dir2 = resolveProjectDir(repo, tmpBase);
      expect(dir2).toBe(join(tmpBase, key));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});
