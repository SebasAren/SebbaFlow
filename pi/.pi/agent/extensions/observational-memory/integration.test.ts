import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock } from "../shared/src/test-mocks";

// Mock external dependencies
mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);

import observationalMemoryExtension from "./index";

describe("observational-memory extension", () => {
  it("can be loaded without errors", () => {
    const mockApi = {
      registerTool: mock(() => {}),
      registerCommand: mock(() => {}),
    };
    expect(() => observationalMemoryExtension(mockApi as any)).not.toThrow();
  });

  it("registers no tools or commands (store-only package)", () => {
    const registeredTools: any[] = [];
    const registeredCommands: { name: string; command: any }[] = [];
    const mockApi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      registerCommand: (name: string, command: any) => {
        registeredCommands.push({ name, command });
      },
    };
    observationalMemoryExtension(mockApi as any);
    expect(registeredTools).toHaveLength(0);
    expect(registeredCommands).toHaveLength(0);
  });
});
