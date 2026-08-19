import { describe, it, expect, mock } from "bun:test";
import { piTuiRenderMock, piCodingAgentThemeMock } from "@pi-ext/shared/test-mocks";

// Mock external deps using shared factories before any imports.
// piTuiRenderMock provides Text/Container/Markdown/Spacer with working render() methods.
mock.module("@earendil-works/pi-tui", piTuiRenderMock);
mock.module("@earendil-works/pi-coding-agent", piCodingAgentThemeMock);

import { Text, Container } from "@earendil-works/pi-tui";
import { Theme } from "@earendil-works/pi-coding-agent";

import { reuseOrCreateText, renderSubagentCall, renderSubagentResult } from "./rendering";
import type { RenderSubagentResultOptions, SubagentResultDetails } from "./rendering";

// ── Test helpers ───────────────────────────────────────────────────────────

/** Minimal 256-color theme that wraps text with ANSI-like markers for assertions. */
function createTestTheme(): Theme {
  return new Theme(
    {
      accent: 12,
      border: 14,
      borderAccent: 13,
      borderMuted: 14,
      success: 2,
      error: 1,
      warning: 3,
      muted: 8,
      dim: 7,
      text: 15,
      thinkingText: 15,
      thinkingMax: 8,
      userMessageText: 15,
      customMessageText: 15,
      customMessageLabel: 12,
      toolTitle: 6,
      toolOutput: 15,
      mdHeading: 12,
      mdLink: 12,
      mdLinkUrl: 14,
      mdCode: 13,
      mdCodeBlock: 15,
      mdCodeBlockBorder: 14,
      mdQuote: 15,
      mdQuoteBorder: 14,
      mdHr: 8,
      mdListBullet: 15,
      toolDiffAdded: 2,
      toolDiffRemoved: 1,
      toolDiffContext: 8,
      syntaxComment: 8,
      syntaxKeyword: 13,
      syntaxFunction: 12,
      syntaxVariable: 15,
      syntaxString: 2,
      syntaxNumber: 6,
      syntaxType: 13,
      syntaxOperator: 7,
      syntaxPunctuation: 7,
      thinkingOff: 8,
      thinkingMinimal: 8,
      thinkingLow: 8,
      thinkingMedium: 8,
      thinkingHigh: 8,
      thinkingXhigh: 8,
      bashMode: 6,
    },
    {
      selectedBg: 0,
      userMessageBg: 0,
      customMessageBg: 0,
      toolPendingBg: 0,
      toolSuccessBg: 0,
      toolErrorBg: 0,
    },
    "256color",
  );
}

/** Render a Component to a flat string (joined lines) for assertions. */
function renderToString(component: unknown, width = 120): string {
  if (component instanceof Text || component instanceof Container) {
    return component.render(width).join("\n");
  }
  return String(component);
}

/** Create a basic result object. */
function makeResult(overrides?: { output?: string; details?: SubagentResultDetails }) {
  return {
    content: [{ type: "text", text: overrides?.output ?? "" }],
    details: overrides?.details,
  };
}

/** Shorthand to call renderSubagentResult and get rendered string. */
function render(
  opts: Partial<RenderSubagentResultOptions> & {
    output?: string;
    details?: SubagentResultDetails;
  },
) {
  const theme = createTestTheme();
  const result = makeResult({ output: opts.output, details: opts.details });
  const component = renderSubagentResult({
    result,
    state: { expanded: opts.state?.expanded ?? false, isPartial: opts.state?.isPartial ?? false },
    theme,
    toolName: opts.toolName ?? "test-tool",
    partialLabel: opts.partialLabel ?? "testing",
    buildExpandedHeader: opts.buildExpandedHeader,
  });
  return renderToString(component);
}

// ── reuseOrCreateText ──────────────────────────────────────────────────────

describe("reuseOrCreateText", () => {
  it("creates a new Text when no lastComponent", () => {
    const text = reuseOrCreateText({});
    expect(text).toBeInstanceOf(Text);
  });

  it("passes through non-Text lastComponent as-is (type cast)", () => {
    const container = new Container();
    const text = reuseOrCreateText({ lastComponent: container });
    expect(text).toBe(container as any);
  });

  it("reuses existing Text component", () => {
    const existing = new Text("hello", 0, 0);
    const result = reuseOrCreateText({ lastComponent: existing });
    expect(result).toBe(existing);
  });
});

// ── renderSubagentCall ─────────────────────────────────────────────────────

describe("renderSubagentCall", () => {
  const theme = createTestTheme();

  it("returns a Text component", () => {
    const result = renderSubagentCall({
      preview: "find files",
      theme,
      context: {},
      toolName: "explore",
    });
    expect(result).toBeInstanceOf(Text);
  });

  it("includes tool name in output", () => {
    const result = renderSubagentCall({
      preview: "find files",
      theme,
      context: {},
      toolName: "explore",
    });
    const rendered = renderToString(result);
    expect(rendered).toContain("explore");
    expect(rendered).toContain("find files");
  });

  it("includes model tag when provided", () => {
    const result = renderSubagentCall({
      preview: "query text",
      theme,
      context: {},
      toolName: "librarian",
      model: "codestral",
    });
    const rendered = renderToString(result);
    expect(rendered).toContain("codestral");
  });

  it("omits model tag when not provided", () => {
    const result = renderSubagentCall({
      preview: "query",
      theme,
      context: {},
      toolName: "explore",
    });
    const rendered = renderToString(result);
    // Should not contain brackets since no model
    expect(rendered).not.toContain("[undefined]");
  });

  it("includes extras when provided", () => {
    const result = renderSubagentCall({
      preview: "query",
      theme,
      context: {},
      toolName: "librarian",
      extras: ["extra line 1", "extra line 2"],
    });
    const rendered = renderToString(result);
    expect(rendered).toContain("extra line 1");
    expect(rendered).toContain("extra line 2");
  });

  it("reuses lastComponent if it is a Text", () => {
    const existing = new Text("old", 0, 0);
    const result = renderSubagentCall({
      preview: "new query",
      theme,
      context: { lastComponent: existing },
      toolName: "explore",
    });
    expect(result).toBe(existing);
    const rendered = renderToString(result);
    expect(rendered).toContain("new query");
  });
});

// ── renderSubagentResult: partial/streaming ────────────────────────────────

describe("renderSubagentResult (partial/streaming)", () => {
  it("shows progress indicator with partial label when no output", () => {
    const rendered = render({
      output: "",
      state: { isPartial: true, expanded: false },
      partialLabel: "exploring",
    });
    expect(rendered).toContain("exploring...");
  });

  it("shows partial sections when output has headers", () => {
    const rendered = render({
      output: "## Summary\nFound 3 files\n## Details\nMore info",
      state: { isPartial: true, expanded: false },
    });
    expect(rendered).toContain("Summary:");
    expect(rendered).toContain("Details:");
    expect(rendered).toContain("Found 3 files");
  });

  it("shows tool name with sections during streaming", () => {
    const rendered = render({
      output: "## Files\nreadme.md",
      state: { isPartial: true, expanded: false },
      toolName: "my-agent",
    });
    expect(rendered).toContain("my-agent");
  });
});

// ── renderSubagentResult: collapsed ────────────────────────────────────────

describe("renderSubagentResult (collapsed)", () => {
  it("shows success icon and tool name", () => {
    const rendered = render({
      output: "Done",
      details: { success: true },
    });
    expect(rendered).toContain("test-tool");
    expect(rendered).toContain("(Ctrl+O to expand)");
  });

  it("shows section summaries from structured output", () => {
    const rendered = render({
      output: "## Files\nreadme.md, main.ts\n## Summary\nFound relevant code",
    });
    expect(rendered).toContain("Files:");
    expect(rendered).toContain("Summary:");
    expect(rendered).toContain("readme.md, main.ts");
    expect(rendered).toContain("Found relevant code");
  });

  it("shows sentence bullets for unstructured output", () => {
    const rendered = render({
      output: "The project uses TypeScript. It has 5 modules. Tests are in bun.",
    });
    expect(rendered).toContain("The project uses TypeScript");
    expect(rendered).toContain("It has 5 modules");
  });

  it("shows expand hint", () => {
    const rendered = render({ output: "Some result" });
    expect(rendered).toContain("(Ctrl+O to expand)");
  });

  it("shows error icon for failed result", () => {
    const rendered = render({
      output: "Something went wrong",
      details: { success: false },
    });
    // Should contain the error output
    expect(rendered).toContain("Something went wrong");
    expect(rendered).toContain("test-tool");
  });

  it("truncates long error output in collapsed view", () => {
    const longError = "x".repeat(200);
    const rendered = render({
      output: longError,
      details: { success: false },
    });
    // Error preview should be truncated to ~120 chars + "..."
    expect(rendered).toContain("...");
    // Should not contain the full 200-char string
    expect(rendered).not.toContain("x".repeat(200));
  });

  it("shows usage line when details.usage is present", () => {
    const rendered = render({
      output: "Done",
      details: {
        usage: { input: 5000, output: 2000, turns: 3, cost: 0.05 },
      },
    });
    expect(rendered).toContain("3 turns");
    expect(rendered).toContain("↑5.0k");
    expect(rendered).toContain("↓2.0k");
  });

  it("shows model in usage line when usedModel is set", () => {
    const rendered = render({
      output: "Done",
      details: {
        usedModel: "codestral",
        usage: { input: 100, output: 50, turns: 1, cost: 0 },
      },
    });
    expect(rendered).toContain("codestral");
  });

  it("shows fallback preview for output with no sections and no sentences", () => {
    const rendered = render({
      output: "   ",
    });
    // Should show tool name and expand hint at minimum
    expect(rendered).toContain("test-tool");
    expect(rendered).toContain("(Ctrl+O to expand)");
  });

  it("shows section summary for output parsed as a single section", () => {
    // Output without ## headers: parseSections treats first line as title, rest as content
    const rendered = render({ output: "First line result\nSecond line detail\nThird line info" });
    expect(rendered).toContain("First line result:");
    expect(rendered).toContain("Second line detail");
  });
});

// ── renderSubagentResult: expanded ─────────────────────────────────────────

describe("renderSubagentResult (expanded)", () => {
  it("returns a Container for expanded view", () => {
    const theme = createTestTheme();
    const result = makeResult({ output: "Done" });
    const component = renderSubagentResult({
      result,
      state: { expanded: true, isPartial: false },
      theme,
      toolName: "explore",
      partialLabel: "exploring",
    });
    expect(component).toBeInstanceOf(Container);
  });

  it("shows tool name and success icon in expanded", () => {
    const rendered = render({
      output: "Done",
      state: { expanded: true, isPartial: false },
      toolName: "explore",
    });
    expect(rendered).toContain("explore");
  });

  it("shows query header by default when details.query is set", () => {
    const rendered = render({
      output: "Done",
      state: { expanded: true, isPartial: false },
      details: { query: "find all tests" },
    });
    expect(rendered).toContain("find all tests");
  });

  it("skips header when no query in details", () => {
    const rendered = render({
      output: "Done",
      state: { expanded: true, isPartial: false },
      details: {},
    });
    // Should still show the tool name but no "Query:" line
    expect(rendered).toContain("test-tool");
    expect(rendered).not.toContain("Query:");
  });

  it("uses custom buildExpandedHeader when provided", () => {
    const rendered = render({
      output: "Done",
      state: { expanded: true, isPartial: false },
      details: { query: "original", library: "react" },
      buildExpandedHeader: (details) => `Custom: ${details.library}`,
    });
    expect(rendered).toContain("Custom: react");
    // Default header should NOT be shown
    expect(rendered).not.toContain("Query:");
  });

  it("shows section dividers for structured output", () => {
    const rendered = render({
      output: "## Files\nreadme.md\n## Summary\nFound things",
      state: { expanded: true, isPartial: false },
    });
    expect(rendered).toContain("Files");
    expect(rendered).toContain("Summary");
    expect(rendered).toContain("readme.md");
    expect(rendered).toContain("Found things");
  });

  it("shows error output in expanded view", () => {
    const rendered = render({
      output: "Error: connection failed",
      state: { expanded: true, isPartial: false },
      details: { success: false },
    });
    expect(rendered).toContain("Error: connection failed");
  });

  it("shows usage line in expanded view", () => {
    const rendered = render({
      output: "Done",
      state: { expanded: true, isPartial: false },
      details: {
        usage: { input: 5000, output: 2000, turns: 3, cost: 0.05 },
      },
    });
    expect(rendered).toContain("3 turns");
  });

  it("shows markdown for unstructured output in expanded view", () => {
    const rendered = render({
      output: "Plain text output without sections",
      state: { expanded: true, isPartial: false },
    });
    expect(rendered).toContain("Plain text output without sections");
  });
});
