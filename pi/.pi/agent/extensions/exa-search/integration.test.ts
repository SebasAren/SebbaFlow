import { describe, it, expect, mock, afterAll } from "bun:test";
import { typeboxMock, piCodingAgentMock } from "../shared/src/test-mocks";

// Mock external dependencies
mock.module("exa-js", () => ({}));

mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);

mock.module("typebox", typeboxMock);

mock.module("@earendil-works/pi-ai", () => ({
  StringEnum: (values: any, options: any) => ({ type: "string", enum: values, ...options }),
}));

import exaSearchExtension from "./index";

describe("exa-search extension", () => {
  const origKey = process.env.EXA_API_KEY;
  const origLibrarian = process.env.PI_LIBRARIAN_LOAD;

  it("can be loaded without errors", () => {
    delete process.env.EXA_API_KEY;
    delete process.env.PI_LIBRARIAN_LOAD;
    const mockApi = {
      registerTool: mock(() => {}),
      registerCommand: mock(() => {}),
    };
    expect(() => exaSearchExtension(mockApi as any)).not.toThrow();
  });

  it("skips registration when not in librarian context (PI_LIBRARIAN_LOAD not set)", () => {
    delete process.env.PI_LIBRARIAN_LOAD;
    const registeredTools: any[] = [];
    const registeredCommands: { name: string; command: any }[] = [];
    const mockApi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      registerCommand: (name: string, command: any) => {
        registeredCommands.push({ name, command });
      },
    };
    exaSearchExtension(mockApi as any);
    expect(registeredTools).toHaveLength(0);
    expect(registeredCommands).toHaveLength(0);
  });

  it("registers two tools (web_search and web_fetch) when in librarian context", () => {
    process.env.PI_LIBRARIAN_LOAD = "1";
    const registeredTools: any[] = [];
    const registeredCommands: { name: string; command: any }[] = [];
    const mockApi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      registerCommand: (name: string, command: any) => {
        registeredCommands.push({ name, command });
      },
    };
    exaSearchExtension(mockApi as any);
    delete process.env.PI_LIBRARIAN_LOAD;
    expect(registeredTools).toHaveLength(2);
    expect(registeredTools[0].name).toBe("web_search");
    expect(registeredTools[1].name).toBe("web_fetch");
    expect(registeredCommands).toHaveLength(0);
  });

  afterAll(() => {
    if (origKey !== undefined) process.env.EXA_API_KEY = origKey;
    else delete process.env.EXA_API_KEY;
    if (origLibrarian !== undefined) process.env.PI_LIBRARIAN_LOAD = origLibrarian;
    else delete process.env.PI_LIBRARIAN_LOAD;
  });
});
