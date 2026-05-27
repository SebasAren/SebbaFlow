import { describe, it, expect, mock, afterAll } from "bun:test";
import { typeboxMock } from "../shared/src/test-mocks";

// Mock external dependencies
mock.module("@upstash/context7-sdk", () => ({
  Context7: class Context7 {},
  Context7Error: class Context7Error extends Error {},
}));

mock.module("typebox", typeboxMock);

mock.module("@earendil-works/pi-ai", () => ({
  StringEnum: (values: any, options: any) => ({ type: "string", enum: values, ...options }),
}));

import context7Extension from "./index";

describe("context7 extension", () => {
  const origKey = process.env.CONTEXT7_API_KEY;
  const origLibrarian = process.env.PI_LIBRARIAN_LOAD;

  it("can be loaded without errors", () => {
    delete process.env.CONTEXT7_API_KEY;
    delete process.env.PI_LIBRARIAN_LOAD;
    const mockApi = {
      registerTool: mock(() => {}),
      registerCommand: mock(() => {}),
    };
    expect(() => context7Extension(mockApi as any)).not.toThrow();
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
    context7Extension(mockApi as any);
    expect(registeredTools).toHaveLength(0);
    expect(registeredCommands).toHaveLength(0);
  });

  it("registers two tools (context7_search and context7_docs) when in librarian context", () => {
    process.env.PI_LIBRARIAN_LOAD = "1";
    const registeredTools: any[] = [];
    const registeredCommands: { name: string; command: any }[] = [];
    const mockApi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      registerCommand: (name: string, command: any) => {
        registeredCommands.push({ name, command });
      },
    };
    context7Extension(mockApi as any);
    delete process.env.PI_LIBRARIAN_LOAD;
    expect(registeredTools).toHaveLength(2);
    expect(registeredTools[0].name).toBe("context7_search");
    expect(registeredTools[1].name).toBe("context7_docs");
    expect(registeredCommands).toHaveLength(0);
  });

  afterAll(() => {
    if (origKey !== undefined) process.env.CONTEXT7_API_KEY = origKey;
    else delete process.env.CONTEXT7_API_KEY;
    if (origLibrarian !== undefined) process.env.PI_LIBRARIAN_LOAD = origLibrarian;
    else delete process.env.PI_LIBRARIAN_LOAD;
  });
});
