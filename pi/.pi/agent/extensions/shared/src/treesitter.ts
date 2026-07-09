/**
 * Tree-sitter based symbol extraction for code files.
 *
 * Loads language grammars as WASM and parses source to extract a lightweight
 * outline (functions, classes, exports, etc.) for relevance ranking.
 */

import { Parser, Language, type Node } from "web-tree-sitter";

/** Has `Parser.init()` already been called? */
let initialized = false;

/** Cached parsers by file extension */
const parsers = new Map<string, Parser>();

/** Mapping from file extension to npm grammar package name */
const EXT_TO_GRAMMAR: Record<string, string> = {
  ".ts": "tree-sitter-typescript",
  ".tsx": "tree-sitter-typescript",
  ".js": "tree-sitter-javascript",
  ".jsx": "tree-sitter-javascript",
  ".mjs": "tree-sitter-javascript",
  ".cjs": "tree-sitter-javascript",
  ".py": "tree-sitter-python",
  ".go": "tree-sitter-go",
  ".rs": "tree-sitter-rust",
  ".cpp": "tree-sitter-cpp",
  ".cc": "tree-sitter-cpp",
  ".cxx": "tree-sitter-cpp",
  ".hpp": "tree-sitter-cpp",
  ".h": "tree-sitter-c",
  ".c": "tree-sitter-c",
  ".svelte": "tree-sitter-svelte",
};

/** Mapping from grammar package to specific WASM file name (defaults to package-name.wasm) */
const GRAMMAR_WASM: Record<string, string> = {
  "tree-sitter-typescript": "tree-sitter-typescript.wasm",
  "tree-sitter-javascript": "tree-sitter-javascript.wasm",
  "tree-sitter-python": "tree-sitter-python.wasm",
  "tree-sitter-go": "tree-sitter-go.wasm",
  "tree-sitter-rust": "tree-sitter-rust.wasm",
  "tree-sitter-cpp": "tree-sitter-cpp.wasm",
  "tree-sitter-c": "tree-sitter-c.wasm",
  "tree-sitter-svelte": "tree-sitter-svelte.wasm",
};

/** File extensions that need a two-phase parse (regex extract script → JS/TS parse).
 * Note: no WASM Vue grammar exists on npm; Vue uses `<script>` block extraction.
 * For Svelte, `tree-sitter-svelte` exists but we still use script extraction for
 * consistent symbol extraction across component frameworks. */
const FRAMEWORK_EXTS = new Set([".svelte", ".vue"]);

/** Initialize the tree-sitter WASM runtime (idempotent). */
export async function initTreeSitter(): Promise<void> {
  if (initialized) return;
  const wasmPath = import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm");
  await Parser.init({
    locateFile() {
      return new URL(wasmPath).pathname;
    },
  });
  initialized = true;
}

/** Resolve the absolute filesystem path for a grammar's WASM file. */
function resolveGrammarWasm(pkg: string): string {
  const wasmFile = GRAMMAR_WASM[pkg] ?? `${pkg.replace(/^@.*\//, "").replace(/\//g, "-")}.wasm`;
  const wasmUrl = import.meta.resolve(`${pkg}/${wasmFile}`);
  return new URL(wasmUrl).pathname;
}

/**
 * Lazily load a Parser configured for the given file extension.
 * Returns `null` if the extension is not supported.
 */
export async function getParser(extension: string): Promise<Parser | null> {
  const ext = extension.toLowerCase();
  if (parsers.has(ext)) return parsers.get(ext)!;

  const pkg = EXT_TO_GRAMMAR[ext];
  if (!pkg) return null;

  await initTreeSitter();
  const wasmPath = resolveGrammarWasm(pkg);
  const language = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(ext, parser);
  return parser;
}

/** Symbol kinds we care about for outline extraction. */
export type SymbolKind =
  "function" | "class" | "interface" | "type_alias" | "method" | "variable" | "export";

/** A single extracted symbol. */
export interface CodeSymbol {
  kind: SymbolKind;
  name: string;
  /** 1-based line number */
  line: number;
  /** Optional type annotation or signature snippet */
  type?: string;
}

/** Result of parsing a single file. */
export interface SymbolOutline {
  file: string;
  language: string;
  symbols: CodeSymbol[];
}

/** Node types that indicate top-level symbols, grouped by language family. */
const SYMBOL_NODE_TYPES: Record<string, { kind: SymbolKind; nameField?: string }> = {
  function_declaration: { kind: "function", nameField: "name" },
  function_definition: { kind: "function", nameField: "declarator" },
  method_definition: { kind: "method", nameField: "name" },
  class_declaration: { kind: "class", nameField: "name" },
  class_definition: { kind: "class", nameField: "name" },
  interface_declaration: { kind: "interface", nameField: "name" },
  type_alias_declaration: { kind: "type_alias", nameField: "name" },
  export_statement: { kind: "export" },
  variable_declaration: { kind: "variable" },
  lexical_declaration: { kind: "variable" },
};

/** Recursively walk the syntax tree and collect top-level-ish symbols. */
function walkSymbols(node: Node, symbols: CodeSymbol[], depth = 0): void {
  if (depth > 5) return; // avoid deep nesting inside function bodies

  const conf = SYMBOL_NODE_TYPES[node.type];
  if (conf) {
    let name = "";
    if (conf.nameField) {
      const nameNode = node.childForFieldName(conf.nameField) ?? node.childForFieldName("name");
      name = nameNode?.text ?? "";
    }
    // Fallback for plain identifiers in export/variable nodes
    if (!name && conf.kind === "export") {
      const decl = node.namedChildren.find((c) =>
        [
          "function_declaration",
          "class_declaration",
          "variable_declaration",
          "lexical_declaration",
        ].includes(c.type),
      );
      if (decl) {
        const nameNode = decl.childForFieldName("name");
        name = nameNode?.text ?? decl.text.slice(0, 40);
      } else {
        name = node.text.slice(0, 40);
      }
    }
    if (!name && conf.kind === "variable") {
      const decl = node.namedChildren.find((c) => c.type === "variable_declarator");
      if (decl) {
        const id = decl.childForFieldName("name") ?? decl.namedChildren[0];
        name = id?.text ?? "";
      }
    }

    symbols.push({
      kind: conf.kind,
      name,
      line: node.startPosition.row + 1,
      type: conf.kind === "function" || conf.kind === "method" ? extractSignature(node) : undefined,
    });

    // Don't recurse into the body of classes/functions — we only want top-level-ish
    if (
      [
        "function_declaration",
        "function_definition",
        "class_declaration",
        "class_definition",
      ].includes(node.type)
    ) {
      return;
    }
  }

  for (const child of node.children) {
    walkSymbols(child, symbols, depth + 1);
  }
}

/** Best-effort signature extraction for function nodes. */
function extractSignature(funcNode: Node): string {
  const params = funcNode.childForFieldName("parameters");
  const ret =
    funcNode.childForFieldName("return_type") ??
    funcNode.namedChildren.find((c) => c.type === "type_annotation");
  let sig = "";
  if (params) sig += params.text;
  if (ret) sig += `: ${ret.text.replace(/^:\s*/, "")}`;
  return sig;
}

/** Extract `<script>` blocks from Svelte / Vue source and detect TS usage.
 * Note: Vue files always use the TypeScript parser regardless of the `lang` attribute. */
function extractScriptBlocks(
  source: string,
  _ext: string,
): { content: string; isTypeScript: boolean }[] {
  // Use a regex fallback for fast extraction — tree-sitter parse of the whole
  // file is overkill when we just need the raw text inside <script> tags.
  const blocks: { content: string; isTypeScript: boolean }[] = [];
  const scriptRegex = /<(script)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(source)) !== null) {
    const attrs = match[2];
    const content = match[3];
    const isTypeScript =
      /\blang\s*=\s*["']ts["']/.test(attrs) || /\blang\s*=\s*["']typescript["']/.test(attrs);
    blocks.push({ content, isTypeScript });
  }
  return blocks;
}

/**
 * Parse a source file and extract a lightweight symbol outline.
 *
 * Returns `null` if the language is unsupported or parsing fails.
 * Gracefully handles files up to a reasonable size; skips very large
 * files to avoid memory pressure.
 */
export async function extractSymbols(
  filePath: string,
  source: string,
): Promise<SymbolOutline | null> {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();

  // Skip enormous files
  if (source.length > 500_000) return null;

  // Two-phase parse for framework files (Svelte / Vue)
  if (FRAMEWORK_EXTS.has(ext)) {
    const blocks = extractScriptBlocks(source, ext);
    if (blocks.length === 0) return null;

    const allSymbols: CodeSymbol[] = [];
    for (const block of blocks) {
      // Always use TypeScript parser for Vue SFC script blocks
      const scriptExt = ext === ".vue" ? ".ts" : block.isTypeScript ? ".ts" : ".js";
      const parser = await getParser(scriptExt);
      if (!parser) continue;
      const tree = parser.parse(block.content);
      if (!tree) continue;
      walkSymbols(tree.rootNode, allSymbols);
      tree.delete();
    }
    return { file: filePath, language: ext, symbols: allSymbols };
  }

  const parser = await getParser(ext);
  if (!parser) return null;

  let tree: ReturnType<typeof parser.parse> | undefined;
  try {
    tree = parser.parse(source);
    if (!tree) return null;
    const symbols: CodeSymbol[] = [];
    walkSymbols(tree.rootNode, symbols);
    return {
      file: filePath,
      language: ext,
      symbols,
    };
  } catch {
    return null;
  } finally {
    tree?.delete();
  }
}
