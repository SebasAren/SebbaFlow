import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { sessionDirFor } from "./index";

describe("sessionDirFor", () => {
  it("encodes an absolute unix cwd into the --<dashes>-- directory name", () => {
    expect(sessionDirFor("/var/home/sebas/dotfiles", "/tmp/agent")).toBe(
      "/tmp/agent/sessions/--var-home-sebas-dotfiles--",
    );
  });

  it("resolves a relative cwd before encoding", () => {
    expect(sessionDirFor(".", "/tmp/agent")).toBe(
      `/tmp/agent/sessions/--${process
        .cwd()
        .replace(/^[/\\]/, "")
        .replace(/[/\\:]/g, "-")}--`,
    );
  });

  it("replaces colons and backslashes with dashes", () => {
    expect(sessionDirFor("/tmp/we:ird\\path", "/tmp/agent")).toBe(
      "/tmp/agent/sessions/--tmp-we-ird-path--",
    );
  });

  it("does not create the directory", () => {
    const dir = sessionDirFor("/nonexistent/cwd", "/tmp/agent");
    expect(existsSync(dir)).toBe(false);
  });
});
