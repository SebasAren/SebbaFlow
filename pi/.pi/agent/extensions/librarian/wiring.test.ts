import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { LIBRARIAN_SYSTEM_PROMPT, LIBRARIAN_SUMMARY_REMINDER } from "./constants";
import { LIBRARIAN_TOOL_NAMES, getLibrarianExtensionDirs, runWithParentSession } from "./index";

describe("LIBRARIAN_SYSTEM_PROMPT", () => {
  it("mentions both session memory tools", () => {
    expect(LIBRARIAN_SYSTEM_PROMPT).toContain("session_search");
    expect(LIBRARIAN_SYSTEM_PROMPT).toContain("session_read");
  });

  it("widens the mission to past session history", () => {
    expect(LIBRARIAN_SYSTEM_PROMPT).toContain("past session");
  });

  it("uses the updated output sections", () => {
    expect(LIBRARIAN_SYSTEM_PROMPT).toContain("## Sources");
    expect(LIBRARIAN_SYSTEM_PROMPT).toContain("## Findings");
    expect(LIBRARIAN_SYSTEM_PROMPT).toContain("## Open Threads");
    expect(LIBRARIAN_SYSTEM_PROMPT).not.toContain("## Documentation");
    expect(LIBRARIAN_SYSTEM_PROMPT).not.toContain("## Key Findings");
    expect(LIBRARIAN_SYSTEM_PROMPT).not.toContain("## Recommendations");
  });
});

describe("librarian wiring", () => {
  it("tool allowlist includes session tools", () => {
    expect(LIBRARIAN_TOOL_NAMES).toContain("session_search");
    expect(LIBRARIAN_TOOL_NAMES).toContain("session_read");
    expect(LIBRARIAN_TOOL_NAMES).toContain("web_search");
    expect(LIBRARIAN_TOOL_NAMES).toContain("wiki_read");
  });

  it("extension paths include session-memory", () => {
    const dirs = getLibrarianExtensionDirs("/tmp/agent");
    expect(dirs.some((d) => d.endsWith(join("extensions", "session-memory")))).toBe(true);
    expect(dirs.some((d) => d.endsWith(join("extensions", "exa-search")))).toBe(true);
  });

  it("summary reminder references the updated sections", () => {
    expect(LIBRARIAN_SUMMARY_REMINDER).toContain("## Open Threads");
  });
});

describe("runWithParentSession", () => {
  it("sets PI_PARENT_SESSION_FILE during the fn and restores it after", async () => {
    delete process.env.PI_PARENT_SESSION_FILE;
    const seen: string | undefined = await runWithParentSession("/tmp/live.jsonl", async () => {
      return process.env.PI_PARENT_SESSION_FILE;
    });
    expect(seen).toBe("/tmp/live.jsonl");
    expect(process.env.PI_PARENT_SESSION_FILE).toBeUndefined();

    process.env.PI_PARENT_SESSION_FILE = "/tmp/prior.jsonl";
    await runWithParentSession(undefined, async () => undefined);
    expect(process.env.PI_PARENT_SESSION_FILE).toBe("/tmp/prior.jsonl");
  });
});
