import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock, piTuiMock, typeboxMock } from "../shared/src/test-mocks";

// Mock external dependencies before importing the extension
mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);
mock.module("@earendil-works/pi-tui", piTuiMock);
mock.module("typebox", typeboxMock);

import factoryExtension, { createExtension } from "./index";
import type { FactoryClient } from "./client";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const ITEM_ID = "aaaaaaaa-1111-1111-1111-111111111111";
const DECISION_ID = "dddddddd-1111-1111-1111-111111111111";

function fakeClient() {
  const listedProjects: string[] = [];
  const client: FactoryClient = {
    listProjects: async () => ({ projects: [{ id: PROJECT_ID, name: "SebbaFlow" }] }),
    listWorkItems: async (projectId: string) => {
      listedProjects.push(projectId);
      return {
        workItems: [
          { id: ITEM_ID, title: "Fix login", stages: ["review"], board: "work", sessions: {} },
        ],
        runningSessionIds: [],
        parkedSessionIds: [],
      };
    },
    listAttention: async () => ({
      items: [{ kind: "mention", title: "Look here", unread: true }],
      kinds: { mention: { open: 1, unread: 1, latest: null } },
    }),
    listDecisions: async () => ({
      decisions: [
        {
          id: DECISION_ID,
          workItemId: ITEM_ID,
          type: "transition",
          status: "proposed",
          role: "implement",
        },
      ],
    }),
    resolveDecision: async (_projectId, _decisionId, action) => ({
      decision: { id: DECISION_ID, status: action === "approve" ? "succeeded" : "dismissed" },
    }),
    resolveProjectId: async () => PROJECT_ID,
  };
  return { client, listedProjects };
}

function captureApi() {
  const tools: any[] = [];
  const commands: { name: string; command: any }[] = [];
  const api = {
    registerTool: (tool: any) => tools.push(tool),
    registerCommand: (name: string, command: any) => commands.push({ name, command }),
  };
  return { tools, commands, api };
}

describe("factory extension integration", () => {
  it("can be loaded without errors", () => {
    const { api } = captureApi();
    expect(() => factoryExtension(api as any)).not.toThrow();
  });

  it("registers four tools", () => {
    const { tools, api } = captureApi();
    factoryExtension(api as any);
    expect(tools.map((tool) => tool.name)).toEqual([
      "factory_items",
      "factory_attention",
      "factory_decisions",
      "factory_resolve",
    ]);
  });

  it("registers the /factory command", () => {
    const { commands, api } = captureApi();
    factoryExtension(api as any);
    expect(commands.map((c) => c.name)).toContain("factory");
  });

  it("factory_items resolves the project and formats items", async () => {
    const { client, listedProjects } = fakeClient();
    const { tools, api } = captureApi();
    createExtension({ client })(api as any);
    const tool = tools.find((t) => t.name === "factory_items");
    const result = await tool.execute("call-1", {}, undefined, undefined, {});
    expect(listedProjects).toEqual([PROJECT_ID]);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Fix login");
  });

  it("factory_resolve approves a decision", async () => {
    const { client } = fakeClient();
    const { tools, api } = captureApi();
    createExtension({ client })(api as any);
    const tool = tools.find((t) => t.name === "factory_resolve");
    const result = await tool.execute(
      "call-2",
      { decisionId: DECISION_ID, action: "approve" },
      undefined,
      undefined,
      {},
    );
    expect(result.content[0].text).toContain("Approved");
    expect(result.content[0].text).toContain("succeeded");
  });

  it("/factory sets a status widget", async () => {
    const { client } = fakeClient();
    const { commands, api } = captureApi();
    createExtension({ client })(api as any);
    const command = commands.find((c) => c.name === "factory")!.command;
    const setWidget = mock(() => {});
    await command.handler({}, { ui: { setWidget, notify: mock(() => {}) } });
    expect(setWidget).toHaveBeenCalledTimes(1);
    const [key, lines] = setWidget.mock.calls[0];
    expect(key).toBe("factory-status");
    expect(lines.join("\n")).toContain("Items: 1");
    expect(lines.join("\n")).toContain("Proposals waiting: 1");
  });

  it("/factory notifies on errors instead of throwing", async () => {
    const client: FactoryClient = {
      ...fakeClient().client,
      resolveProjectId: async () => {
        throw new Error("Cannot reach Factory");
      },
    };
    const { commands, api } = captureApi();
    createExtension({ client })(api as any);
    const command = commands.find((c) => c.name === "factory")!.command;
    const notify = mock(() => {});
    await command.handler({}, { ui: { setWidget: mock(() => {}), notify } });
    expect(notify).toHaveBeenCalledWith("Cannot reach Factory", "error");
  });
});
