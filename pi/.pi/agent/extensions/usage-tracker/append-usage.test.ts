import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { UsageEntry } from "./parse-usage";

// Mock fs before importing the module under test
const mockAppendFileSync = mock(() => {});
const mockMkdirSync = mock(() => {});

mock.module("node:fs", () => ({
  appendFileSync: mockAppendFileSync,
  mkdirSync: mockMkdirSync,
}));

// Suppress noisy console.error from error-gracefulness tests
const mockConsoleError = mock<(...args: unknown[]) => void>(() => {});
console.error = mockConsoleError;

import { appendUsageEntry } from "./append-usage";

const makeEntry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  ts: 1700000000000,
  project: "/home/user/project",
  model: "claude-sonnet-4-20250514",
  input: 1000,
  output: 500,
  cacheRead: 200,
  cacheWrite: 100,
  cost: 0.015,
  ...overrides,
});

describe("appendUsageEntry", () => {
  beforeEach(() => {
    mockAppendFileSync.mockClear();
    mockMkdirSync.mockClear();
  });

  it("appends a JSON line to the file", () => {
    const entry = makeEntry();
    appendUsageEntry(entry, "/tmp/usage.jsonl");

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const [filePath, data] = mockAppendFileSync.mock.calls[0];
    expect(filePath).toBe("/tmp/usage.jsonl");
    expect(data).toBe(JSON.stringify(entry) + "\n");
  });

  it("creates parent directory if it does not exist", () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error("EEXIST");
    });

    const entry = makeEntry();
    // Should not throw — mkdirSync errors are caught
    appendUsageEntry(entry, "/tmp/nonexistent/dir/usage.jsonl");

    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/nonexistent/dir", {
      recursive: true,
    });
  });

  it("handles appendFileSync errors gracefully", () => {
    mockAppendFileSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const entry = makeEntry();
    // Should not throw — write errors are caught and logged
    expect(() => {
      appendUsageEntry(entry, "/tmp/usage.jsonl");
    }).not.toThrow();
  });

  it("handles mkdirSync errors gracefully", () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error("ENOSPC: no space left");
    });

    const entry = makeEntry();
    expect(() => {
      appendUsageEntry(entry, "/tmp/usage.jsonl");
    }).not.toThrow();
  });
});
