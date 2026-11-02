import { describe, it, expect } from "bun:test";
import { assistantObservation, gist, userObservation } from "./observe";

const ctx = { cwd: "/home/user/project", sessionId: "session-1" };

describe("gist", () => {
  it("collapses whitespace", () => {
    expect(gist("foo\n  bar\t\tbaz", 100)).toBe("foo bar baz");
  });

  it("truncates with an ellipsis", () => {
    const result = gist("a".repeat(50), 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("…")).toBe(true);
  });

  it("passes short text through unchanged", () => {
    expect(gist("short", 10)).toBe("short");
  });
});

describe("userObservation", () => {
  it("records a plain request with identity stamped", () => {
    const entry = userObservation("fix the login bug", ctx);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe("user");
    expect(entry!.cwd).toBe("/home/user/project");
    expect(entry!.sessionId).toBe("session-1");
    expect(entry!.text).toBe("fix the login bug");
  });

  it("skips slash commands", () => {
    expect(userObservation("/memory", ctx)).toBeNull();
    expect(userObservation("  /usage", ctx)).toBeNull();
  });

  it("skips empty input", () => {
    expect(userObservation("", ctx)).toBeNull();
    expect(userObservation("   \n  ", ctx)).toBeNull();
  });

  it("truncates long requests to the user gist limit", () => {
    const entry = userObservation("x".repeat(500), ctx);
    expect(entry!.text.length).toBeLessThanOrEqual(200);
  });
});

describe("assistantObservation", () => {
  it("collects text, unique tools, and file paths", () => {
    const entry = assistantObservation(
      {
        role: "assistant",
        timestamp: 1700000000000,
        content: [
          { type: "text", text: "Edited the auth module." },
          { type: "toolCall", name: "read", arguments: { path: "/tmp/a" } },
          { type: "toolCall", name: "edit", arguments: { file_path: "/src/auth.ts" } },
          { type: "toolCall", name: "edit", arguments: { file_path: "/src/auth.ts" } },
          { type: "toolCall", name: "bash", arguments: { command: "ls" } },
        ],
      },
      [],
      ctx,
    );

    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe("assistant");
    expect(entry!.text).toBe("Edited the auth module.");
    expect(entry!.tools).toEqual(["read", "edit", "bash"]);
    expect(entry!.files).toEqual(["/src/auth.ts"]);
    expect(entry!.ts).toBe(1700000000000);
    expect(entry!.errors).toBeUndefined();
  });

  it("extracts file paths from path and filePath argument keys too", () => {
    const entry = assistantObservation(
      {
        role: "assistant",
        content: [
          { type: "toolCall", name: "write", arguments: { path: "/a.txt" } },
          { type: "toolCall", name: "multiedit", arguments: { filePath: "/b.txt" } },
        ],
      },
      [],
      ctx,
    );
    expect(entry!.files).toEqual(["/a.txt", "/b.txt"]);
  });

  it("records error gists from failed tool results", () => {
    const entry = assistantObservation(
      { role: "assistant", content: [{ type: "text", text: "Retried the deploy." }] },
      [
        {
          toolName: "bash",
          isError: true,
          content: [{ type: "text", text: "exit code 1: tests failed" }],
        },
        { toolName: "read", isError: false, content: [{ type: "text", text: "ok" }] },
      ],
      ctx,
    );

    expect(entry!.errors).toEqual(["bash: exit code 1: tests failed"]);
  });

  it("records a turn with errors but no text", () => {
    const entry = assistantObservation(
      { role: "assistant", content: [] },
      [{ toolName: "bash", isError: true, content: [] }],
      ctx,
    );
    expect(entry).not.toBeNull();
    expect(entry!.text).toBe("");
    expect(entry!.errors).toEqual(["bash: failed"]);
  });

  it("returns null for intermediate read-only turns", () => {
    expect(
      assistantObservation(
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "hmm" },
            { type: "toolCall", name: "read", arguments: { path: "/tmp/a" } },
          ],
        },
        [{ toolName: "read", isError: false, content: [{ type: "text", text: "contents" }] }],
        ctx,
      ),
    ).toBeNull();
  });

  it("records a turn that only touched files", () => {
    const entry = assistantObservation(
      {
        role: "assistant",
        content: [{ type: "toolCall", name: "edit", arguments: { file_path: "/src/x.ts" } }],
      },
      [],
      ctx,
    );
    expect(entry).not.toBeNull();
    expect(entry!.files).toEqual(["/src/x.ts"]);
  });

  it("caps tools, files, and errors", () => {
    const content = [
      ...Array.from({ length: 12 }, (_, i) => ({
        type: "toolCall" as const,
        name: `tool-${i}`,
        arguments: {},
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        type: "toolCall" as const,
        name: "edit",
        arguments: { file_path: `/f/${i}` },
      })),
    ];
    const entry = assistantObservation(
      { role: "assistant", content },
      Array.from({ length: 6 }, () => ({ toolName: "bash", isError: true, content: [] })),
      ctx,
    );

    expect(entry!.tools).toHaveLength(8);
    expect(entry!.files).toHaveLength(8);
    expect(entry!.errors).toHaveLength(3);
  });

  it("falls back to Date.now() when the message has no timestamp", () => {
    const before = Date.now();
    const entry = assistantObservation(
      { role: "assistant", content: [{ type: "text", text: "done" }] },
      [],
      ctx,
    );
    expect(entry!.ts).toBeGreaterThanOrEqual(before);
  });
});
