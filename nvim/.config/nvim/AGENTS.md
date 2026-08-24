# Neovim Configuration

Requires **Neovim 0.11+** (uses `vim.lsp.config` / `vim.lsp.enable` APIs).

Lazy.nvim-based config with LSP servers, AI-powered completion (minuet+codestral), and modular plugin specs.

## Structure

```
init.lua
lua/
  config/
    lazy.lua         # Lazy.nvim bootstrap
    settings.lua     # vim.o options
    mappings.lua     # Global + LSP keybindings
    lsp.lua          # LSP server registration
    diagnostic.lua   # Diagnostic display config
  plugins/           # Plugin specs (one file per plugin/group)
lsp/                 # Per-server configs (basedpyright.lua, yamlls.lua, etc.)
```

## Plugin Specs

Each file in `lua/plugins/` returns a Lazy.nvim table:

```lua
return {
  "user/plugin",
  ---@type LazyPluginSpec
  opts = { ... },
  opts_extend = { "settings" },  -- for extending defaults
}
```

## Key Plugins

| Plugin                 | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| blink.cmp              | Completion (LSP + Minuet-AI/Codestral for inline completions) |
| conform.nvim           | Formatting (StyLua, prettierd, black, isort)                  |
| nvim-lint              | Linting (ruff, hadolint) — lua uses lua_ls (LSP) instead      |
| nvim-dap + nvim-dap-ui | Debugging (JS/TS, Python)                                     |
| neotest                | Testing (`<leader>t` prefix)                                  |
| fzf-lua                | Fuzzy finder                                                  |

## LSP

Servers registered via `vim.lsp.config` and enabled with `vim.lsp.enable`. Per-server configs in `lsp/*.lua`:

```lua
return {
  default_config = {
    cmd = { ... },
    root_markers = { ".git" },
    settings = { ... },
  },
}
```

Key servers with `lsp/*.lua` configs: basedpyright (Python), lua_ls, jsonls, graphql, yamlls, eslint, html, svelte, vue_ls, cucumber_language_server, emmet_language_server, prismals, terraformls.

Servers configured inline in `lua/config/lsp.lua`: tailwindcss, astro.

Plugins providing LSP: typescript-tools.nvim (`pmizio/typescript-tools.nvim` in `lua/plugins/lsp.lua`) handles TypeScript/Vue.

## Keybindings

- Leader: `<space>`
- `gd` — goto definition
- `gr` — references
- `<space>ca` — code action
- `<space>rn` — rename
- `<C-x><C-l>` — LSP completion (insert mode)

## Conventions

- 2-space indent, StyLua formatting
- `---@type` annotations for LuaLS
- `snake_case` for functions and variables
- `opts_extend` pattern for extending plugin defaults
- `pcall(require, "custom-settings")` for machine-specific overrides (gitignored)

## Anti-Patterns

- NO `vim.cmd()` for plugin setup — use `require().setup()`
- NO `vim.cmd("packadd")` — Lazy.nvim handles loading
- NO hardcoded paths — use `vim.fn.stdpath("config")`
- NO `as any` or `@ts-ignore` in TypeScript

## Commands

| Command                       | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `:Lazy sync`                  | Update all plugins                  |
| `:ConformInfo`                | Show formatter status               |
| `:LspInfo`                    | Show LSP server status              |
| `:Mason`                      | Manage LSP/formatter/linter servers |
| `:lua =vim.lsp.get_clients()` | List active LSP clients             |

## Markdown Performance Gotchas

Large markdown files (>3k lines) need several optimizations. These are applied in `folds.lua`, `treesitter-autocmd.lua` (in `lua/config/`), `tools.lua`, and `mini.lua`:

- **nvim-ufo must exclude markdown from treesitter folding**: `provider_selector` must return `"indent"` only for markdown. Treesitter fold computation on markdown is extremely expensive and freezes Neovim.
- **treesitter-autocmd.lua guard is not enough**: The `if ft ~= "markdown"` guard skips foldexpr/indentexpr, but nvim-ufo overrides it. Both must be kept in sync.
- **Skip treesitter entirely for large markdown**: The `markdown_inline` parser is the biggest performance killer — it parses every bold, italic, code-span, and link across the entire document. Use `M.markdown_line_threshold` to control the cutoff.
- **indent-blankline must exclude markdown**: Markdown has no meaningful indent structure. ibl creates thousands of virtual text extmarks for zero value. Keep `exclude = { filetypes = { "markdown" } }`.
- **mini.cursorword must be disabled for markdown**: It scans the entire buffer for the word under cursor on every cursor move — O(n) per move. Use `vim.b.minicursorword_disable = true` via FileType autocmd.
