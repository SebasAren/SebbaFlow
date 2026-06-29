import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock, piTuiMock } from "@pi-ext/shared/test-mocks";

mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);
mock.module("@earendil-works/pi-tui", piTuiMock);

import ext from "./index";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createExtension() {
  const tools: Array<{ name: string } & Record<string, any>> = [];
  const commands: Array<{ name: string; def: Record<string, any> }> = [];
  const storedEntries: Array<{ type: string; data?: any }> = [];
  const labels = new Map<string, string>();
  const events = new Map<string, (...args: any[]) => any>();
  const sentUserMessages: Array<{ content: string; options?: any }> = [];

  const pi = {
    registerTool: (def: any) => tools.push(def),
    registerCommand: (name: string, def: any) => commands.push({ name, def }),
    on: (event: string, handler: any) => events.set(event, handler),
    appendEntry: (type: string, data: any) => storedEntries.push({ type, data }),
    setLabel: (id: string, label: string) => labels.set(id, label),
    sendUserMessage: (content: string, options?: any) => {
      sentUserMessages.push({ content, options });
    },
  };

  ext(pi as any);

  function makeCtx(
    opts: {
      leafId?: string;
      entries?: Array<{ id: string; type: string; customType?: string; label?: string }>;
      navigateTree?: (targetId: string, options: any) => Promise<{ cancelled: boolean }>;
      model?: unknown;
    } = {},
  ) {
    const notifications: Array<{ message: string; level: string }> = [];
    const customCalls: Array<{ message: string; component: any }> = [];
    const labelMap = new Map(labels);
    for (const e of opts.entries ?? []) {
      if (e.label) labelMap.set(e.id, e.label);
    }
    return {
      sessionManager: {
        getLeafId: () => opts.leafId ?? undefined,
        getEntries: () => opts.entries ?? [],
        getLabel: (id: string) => labelMap.get(id),
      },
      ui: {
        notify: (message: string, level: string) => {
          notifications.push({ message, level });
        },
        custom: <T>(cb: (tui: any, theme: any, kb: any, done: (val: T) => void) => any) => {
          return new Promise<T>((resolve) => {
            const component = cb({ requestRender: () => {} }, makeTheme(), {}, (val: T) =>
              resolve(val),
            );
            // Capture the message from the BorderedLoader constructor arg
            // (mock BorderedLoader is just `class {}`, so we capture via the
            // string arg passed to the constructor)
            customCalls.push({ message: "", component });
          });
        },
      },
      // Default to a truthy model so summarize-enabled navigation tests exercise the
      // summarize:true path. Pass `model: undefined` explicitly to test the no-model fallback.
      model: "model" in opts ? opts.model : { id: "test-model" },
      navigateTree: opts.navigateTree ?? (async () => ({ cancelled: false })),
      notifications,
      customCalls,
    };
  }

  return { tools, commands, storedEntries, labels, events, makeCtx, sentUserMessages };
}

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bg: () => "",
    bold: (text: string) => text,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("tdd-tree extension", () => {
  it("registers tdd-set-kickoff tool and both commands", () => {
    const { tools, commands } = createExtension();
    expect(tools.some((t) => t.name === "tdd-set-kickoff")).toBe(true);
    expect(commands.some((c) => c.name === "tdd-go-kickoff")).toBe(true);
    expect(commands.some((c) => c.name === "kickoff")).toBe(true);
  });

  describe("tdd-set-kickoff tool", () => {
    it("refuses when no leaf exists", async () => {
      const { tools, makeCtx } = createExtension();
      const tool = tools.find((t) => t.name === "tdd-set-kickoff")!;
      const ctx = makeCtx();
      const result = await tool.execute("id", { slug: "plan" }, undefined, () => {}, ctx);
      expect(result.details?.success).toBe(false);
      expect(result.content[0].text).toContain("No session content yet");
    });

    it("refuses duplicate and mentions /kickoff", async () => {
      const { tools, events, makeCtx } = createExtension();
      const tool = tools.find((t) => t.name === "tdd-set-kickoff")!;
      const entries = [
        {
          id: "leaf-1",
          type: "custom",
          customType: "tdd-kickoff",
          data: { slug: "plan", entryId: "leaf-1" },
        },
      ] as const;
      const ctx = makeCtx({ leafId: "leaf-2", entries });
      await events.get("session_start")?.({}, ctx);

      const result = await tool.execute("id", { slug: "plan" }, undefined, () => {}, ctx);
      expect(result.details?.success).toBe(false);
      expect(result.content[0].text).toContain("already exists");
      expect(result.content[0].text).toContain("/kickoff");
    });

    it("sets kickoff and mentions /kickoff on success", async () => {
      const { tools, labels, storedEntries, makeCtx } = createExtension();
      const tool = tools.find((t) => t.name === "tdd-set-kickoff")!;
      const ctx = makeCtx({ leafId: "leaf-2" });
      const result = await tool.execute("id", { slug: "plan" }, undefined, () => {}, ctx);
      expect(result.details?.success).not.toBe(false);
      expect(result.content[0].text).toContain("/kickoff");
      expect(labels.get("leaf-2")).toBe("tdd-kickoff-plan");
      expect(storedEntries).toHaveLength(1);
      expect(storedEntries[0].data.slug).toBe("plan");
    });

    it("renderCall produces text component", () => {
      const { tools } = createExtension();
      const tool = tools.find((t) => t.name === "tdd-set-kickoff")!;
      const result = tool.renderCall({ slug: "auth" }, makeTheme(), {});
      expect(result.text).toContain("auth");
    });

    it("renderResult reuses context.lastComponent", () => {
      const { tools } = createExtension();
      const tool = tools.find((t) => t.name === "tdd-set-kickoff")!;
      const existing = { setText: mock(() => {}) };
      const result = tool.renderResult(
        { content: [], details: { success: true, slug: "auth" } },
        {},
        makeTheme(),
        { lastComponent: existing as any },
      );
      expect(result).toBe(existing);
      expect(existing.setText).toHaveBeenCalledWith('✅ Kickoff set for "auth"');
    });

    it("renderResult shows error for failed kickoff", () => {
      const { tools } = createExtension();
      const tool = tools.find((t) => t.name === "tdd-set-kickoff")!;
      const result = tool.renderResult(
        { content: [], details: { success: false } },
        {},
        makeTheme(),
        {},
      );
      expect(result.text).toContain("❌");
    });
  });

  describe("/tdd-go-kickoff command", () => {
    it("shows usage without args", async () => {
      const { commands, makeCtx } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const ctx = makeCtx();
      await cmd.handler("", ctx);
      expect(ctx.notifications).toContainEqual({
        message: "Usage: /tdd-go-kickoff <slug>",
        level: "info",
      });
    });

    it("navigates to labeled entry when not in cache", async () => {
      const { commands, makeCtx } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({
        leafId: "current",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
      });
      await cmd.handler("plan", ctx);
      expect(navigateTree).toHaveBeenCalledWith(
        "target",
        expect.objectContaining({ summarize: true }),
      );
    });

    it("short-circuits when already at kickoff", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({
        leafId: "target",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
      });
      await cmd.handler("plan", ctx);
      expect(navigateTree).not.toHaveBeenCalled();
      expect(ctx.notifications).toContainEqual({
        message: "Already at the kickoff point.",
        level: "info",
      });
      expect(sentUserMessages).toHaveLength(0);
    });

    it("falls back to label scan when cached entry is stale", async () => {
      const { commands, events, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;

      // Populate cache via session_start
      const entries = [
        {
          id: "old-target",
          type: "custom",
          customType: "tdd-kickoff",
          data: { slug: "plan", entryId: "old-target" },
        },
      ] as const;
      await events.get("session_start")?.({}, makeCtx({ entries }));

      // Now call command with empty session (stale cache) and no matching label
      const ctx = makeCtx({ leafId: "current", entries: [] });
      await cmd.handler("plan", ctx);
      expect(ctx.notifications).toContainEqual({
        message: expect.stringContaining("No kickoff point found"),
        level: "error",
      });
      expect(sentUserMessages).toHaveLength(0);
    });

    it("reports error when no kickoff is found", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const ctx = makeCtx({ leafId: "current" });
      await cmd.handler("missing", ctx);
      expect(ctx.notifications).toContainEqual({
        message: expect.stringContaining("No kickoff point found"),
        level: "error",
      });
      expect(sentUserMessages).toHaveLength(0);
    });
  });

  describe("navigation spinner", () => {
    it("shows spinner via ctx.ui.custom during navigation", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({
        leafId: "current",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
      });
      await cmd.handler("plan", ctx);
      // custom was called (spinner was shown)
      expect(ctx.customCalls.length).toBe(1);
      // The callback returned a BorderedLoader instance
      expect(ctx.customCalls[0].component).toBeDefined();
      expect(ctx.customCalls[0].component.constructor.name).toBe("BorderedLoader");
      // Continuation message sent after successful navigation
      expect(sentUserMessages).toHaveLength(1);
      expect(sentUserMessages[0].content).toBe('Continue implementing the "plan" plan.');
      // Queued as a follow-up so it doesn't throw "already processing" if the
      // agent is still mid-navigation/summary after navigateTree resolves.
      expect(sentUserMessages[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("no spinner when already at kickoff", async () => {
      const { commands, makeCtx } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({
        leafId: "target",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
      });
      await cmd.handler("plan", ctx);
      expect(ctx.customCalls.length).toBe(0);
    });

    it("no spinner when kickoff not found", async () => {
      const { commands, makeCtx } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const ctx = makeCtx({ leafId: "current" });
      await cmd.handler("missing", ctx);
      expect(ctx.customCalls.length).toBe(0);
    });

    it("surfaces navigateTree errors instead of masking them as cancelled", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      // navigateTree rejects (e.g. summarization/auth failure in newer pi builds).
      // Previously the extension swallowed this and reported "Navigation cancelled.".
      const navigateTree = mock(() =>
        Promise.reject(new Error("No model available for summarization")),
      );
      const ctx = makeCtx({
        leafId: "current",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
      });
      await cmd.handler("plan", ctx);
      // The real error message is surfaced at error level, not masked as "cancelled".
      expect(ctx.notifications).toContainEqual({
        message: "Kickoff navigation failed: No model available for summarization",
        level: "error",
      });
      // No continuation message on failure.
      expect(sentUserMessages).toHaveLength(0);
    });

    it("navigates without a summary when no model is available", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({
        leafId: "current",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
        model: undefined,
      });
      await cmd.handler("plan", ctx);
      // summarize:false because no model — avoids the navigateTree throw.
      expect(navigateTree).toHaveBeenCalledWith(
        "target",
        expect.objectContaining({ summarize: false }),
      );
      // Warns that the step summary was skipped.
      expect(ctx.notifications).toContainEqual({
        message: expect.stringContaining("No model selected"),
        level: "warning",
      });
      // Still navigates and continues the plan.
      expect(sentUserMessages).toHaveLength(1);
    });

    it("lets Escape dismiss the loader via BorderedLoader onAbort", async () => {
      const { commands, makeCtx } = createExtension();
      const cmd = commands.find((c) => c.name === "tdd-go-kickoff")!.def;
      // navigateTree never resolves so we can drive the loader manually.
      const navigateTree = () =>
        new Promise<{ cancelled: boolean }>(() => {
          /* never resolves */
        });
      const ctx = makeCtx({
        leafId: "current",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree: navigateTree as any,
      });
      const pending = cmd.handler("plan", ctx);
      // The factory ran synchronously and registered onAbort on the loader.
      const loader = ctx.customCalls[0].component;
      expect(typeof loader.onAbort).toBe("function");
      // Simulate pressing Escape.
      loader.onAbort();
      await pending;
      expect(ctx.notifications).toContainEqual({
        message: "Navigation cancelled.",
        level: "info",
      });
    });
  });

  describe("/kickoff command", () => {
    it("uses activeSlug when no argument given", async () => {
      const { commands, events, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "kickoff")!.def;

      const entries = [
        {
          id: "target",
          type: "custom",
          customType: "tdd-kickoff",
          data: { slug: "plan", entryId: "target" },
        },
      ] as const;
      await events.get("session_start")?.({}, makeCtx({ entries }));

      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({ leafId: "current", entries, navigateTree });
      await cmd.handler("", ctx);
      expect(navigateTree).toHaveBeenCalledWith("target", expect.anything());
      expect(sentUserMessages).toHaveLength(1);
      expect(sentUserMessages[0].content).toBe('Continue implementing the "plan" plan.');
    });

    it("navigates with explicit slug", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "kickoff")!.def;
      const navigateTree = mock(() => Promise.resolve({ cancelled: false }));
      const ctx = makeCtx({
        leafId: "current",
        entries: [{ id: "target", type: "custom", label: "tdd-kickoff-plan" }],
        navigateTree,
      });
      await cmd.handler("plan", ctx);
      expect(navigateTree).toHaveBeenCalledWith("target", expect.anything());
      expect(sentUserMessages).toHaveLength(1);
      expect(sentUserMessages[0].content).toBe('Continue implementing the "plan" plan.');
    });

    it("errors when no activeSlug and no entries", async () => {
      const { commands, makeCtx, sentUserMessages } = createExtension();
      const cmd = commands.find((c) => c.name === "kickoff")!.def;
      const ctx = makeCtx();
      await cmd.handler("", ctx);
      expect(ctx.notifications).toContainEqual({
        message: expect.stringContaining("No kickoff points found"),
        level: "error",
      });
      expect(sentUserMessages).toHaveLength(0);
    });
  });
});
