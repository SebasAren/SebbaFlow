/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
/**
 * Shared mock factory functions for extension tests.
 *
 * Intentional mock infrastructure with `any`-typed fixtures.
 *
 * Each extension test file should call `mock.module()` with these factories
 * at the top level (before importing the extension under test) so that
 * Bun's mock-hoisting works correctly. Using a single shared definition
 * prevents conflicting mocks when all tests run in the same process.
 *
 * Usage:
 *   import { mock } from "bun:test";
 *   import {
 *     piCodingAgentMock,
 *     piTuiMock,
 *     typeboxMock,
 *   } from "@pi-ext/shared/test-mocks";
 *
 *   mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);
 *   mock.module("@earendil-works/pi-tui", piTuiMock);
 *   mock.module("typebox", typeboxMock);
 *
 *   import myExtension from "./index";
 */

/**
 * Complete mock for `@earendil-works/pi-coding-agent`.
 * Covers every export used by any extension.
 */
export const piCodingAgentMock = () => ({
  getMarkdownTheme: () => ({}),
  getSettingsListTheme: () => ({}),
  renderDiff: (text: string) => text,
  highlightCode: (text: string) => text.split("\n"),
  getLanguageFromPath: () => undefined,
  keyHint: (_binding: string, description: string) => description,
  getAgentDir: () => "/tmp/agent",
  parseFrontmatter: () => ({ frontmatter: {}, body: "" }),
  defineTool: (_def: any) => _def,
  convertToLlm: () => ({}),
  serializeConversation: () => [],
  createAgentSession: () => ({}),
  DEFAULT_MAX_BYTES: 50000,
  DEFAULT_MAX_LINES: 500,
  truncateHead: (content: string) => ({ content, truncated: false }),
  VERSION: "0.0.0-mock",
  // Class mocks
  DefaultResourceLoader: class {
    constructor() {}
    async loadExtensions() {
      return [];
    }
    async loadTools() {
      return [];
    }
  },
  DynamicBorder: class {
    constructor() {}
    invalidate() {}
    render() {
      return [];
    }
  },
  Theme: class {
    fg(_c: string, t: string) {
      return t;
    }
    bg(_c: string, t: string) {
      return t;
    }
    bold(t: string) {
      return t;
    }
  },
  AuthStorage: class {
    static getInstance() {
      return {};
    }
    getKey() {
      return undefined;
    }
    setKey() {}
  },
  ModelRegistry: class {
    static getInstance() {
      return {};
    }
  },
  ModelRuntime: class {
    static async create() {
      return new (this as any)();
    }
    getModel() {
      return undefined;
    }
    getModels() {
      return [];
    }
    async getAvailable() {
      return [];
    }
    getProviders() {
      return [];
    }
  },
  SessionManager: class {},
  SettingsManager: class {
    static getInstance() {
      return {};
    }
  },
  BorderedLoader: class {},
  AgentSession: class {},
  CustomEditor: class {},
});

/**
 * Complete mock for `@earendil-works/pi-tui`.
 * Covers every export used by any extension:
 *   - `Container`, `Markdown`, `Spacer`, `Text` (explore, librarian, wt-worktree)
 *   - `Key` (claude-rules, explore, librarian, shared)
 *
 * Text and Container have `.text` / `.children` access but NO `render()` method.
 * For tests that need `render()` (e.g. rendering unit tests), use `piTuiRenderMock`
 * instead.
 */
export const piTuiMock = () => ({
  Container: class Container {
    addChild() {}
  },
  Markdown: class Markdown {},
  Spacer: class Spacer {},
  Text: class Text {
    constructor(
      public text: string,
      _x: number,
      _y: number,
    ) {}
    setText(t: string) {
      this.text = t;
    }
  },
  Key: {
    ctrlAlt: (key: string) => `ctrl-alt-${key}`,
  },
});

/**
 * Richer mock for `@earendil-works/pi-tui` with working `render()` methods.
 *
 * Use this instead of `piTuiMock` when tests need to call `component.render(width)`
 * and assert on the rendered output. Each class serialises its content to string
 * arrays, mimicking the real TUI render pipeline.
 */
export const piTuiRenderMock = () => ({
  Container: class Container {
    children: any[] = [];
    addChild(child: any) {
      this.children.push(child);
    }
    render(width: number): string[] {
      const lines: string[] = [];
      for (const child of this.children) {
        lines.push(...child.render(width));
      }
      return lines;
    }
  },
  Markdown: class Markdown {
    text: string;
    constructor(text: string, _x: number, _y: number) {
      this.text = text;
    }
    render(_width: number): string[] {
      return this.text.split("\n");
    }
  },
  Spacer: class Spacer {
    lines: number;
    constructor(lines: number) {
      this.lines = lines;
    }
    render(_width: number): string[] {
      return Array(this.lines).fill("");
    }
  },
  Text: class Text {
    text: string;
    constructor(text: string | string[], _x: number, _y: number) {
      this.text = Array.isArray(text) ? text.join("\n") : text;
    }
    setText(t: string) {
      this.text = t;
    }
    render(_width: number): string[] {
      return this.text.split("\n");
    }
  },
  Key: {
    ctrlAlt: (key: string) => `ctrl-alt-${key}`,
  },
});

/**
 * Complete mock for `typebox`.
 * Covers every `Type.*` method used by any extension.
 */
export const typeboxMock = () => ({
  Type: {
    Object: (props: any) => ({ type: "object", ...props }),
    String: (props: any) => ({ type: "string", ...props }),
    Number: (props: any) => ({ type: "number", ...props }),
    Boolean: (props: any) => ({ type: "boolean", ...props }),
    Optional: (schema: any) => ({ ...schema, optional: true }),
    Array: (items: any, options: any) => ({ type: "array", items, ...options }),
    Literal: (value: any) => ({ const: value }),
    Union: (schemas: any[]) => ({ anyOf: schemas }),
    Unsafe: (schema: any) => schema,
  },
});

/**
 * Mock for `@earendil-works/pi-coding-agent` that includes a pass-through `Theme` class.
 *
 * `Theme.fg()` / `Theme.bg()` / `Theme.bold()` simply return their text argument
 * unchanged, which is perfect for asserting on rendered content without ANSI
 * color noise.
 *
 * Also includes `getMarkdownTheme` and `truncateHead` stubs.
 */
export const piCodingAgentThemeMock = () => ({
  Theme: class Theme {
    colors: Record<string, number>;
    bgColors: Record<string, number>;
    terminalType: string;
    constructor(
      colors: Record<string, number>,
      bgColors: Record<string, number>,
      terminalType: string,
    ) {
      this.colors = colors;
      this.bgColors = bgColors;
      this.terminalType = terminalType;
    }
    fg(_color: string, text: string): string {
      return text;
    }
    bg(_color: string, text: string): string {
      return text;
    }
    bold(text: string): string {
      return text;
    }
  },
  getMarkdownTheme: () => ({}),
  DEFAULT_MAX_BYTES: 50000,
  DEFAULT_MAX_LINES: 500,
  truncateHead: (c: string) => ({ content: c, truncated: false }),
  DynamicBorder: class DynamicBorder {
    constructor() {}
    invalidate() {}
    render() {
      return [];
    }
  },
  AuthStorage: class AuthStorage {
    static getInstance() {
      return new AuthStorage();
    }
  },
});
