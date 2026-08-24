# Neovim Configuration

Requires **Neovim 0.11+** (native `vim.lsp.config` / `vim.lsp.enable`).

Lazy.nvim-based Neovim config with 15 LSP servers, AI-assisted completion, and extensive plugin suite.

## Setup

```bash
stow nvim
nvim --headless "+Lazy! sync" +qa   # install plugins
```

LSP servers are managed by Mason (`:Mason` in Neovim). The config auto-installs servers on first use.

## Plugin Ecosystem

### Completion

[blink.cmp](https://github.com/Saghen/blink.cmp) with AI providers:

- **Codestral** (Mistral) for code completion
- **Minuet-AI** for extended context suggestions

### LSP

15 servers registered via native `vim.lsp.config` / `vim.lsp.enable` (Neovim 0.11+). Mason (`:Mason`) installs servers; `mason-lspconfig` bridges install names. Per-server configs in `lsp/*.lua`. Key servers:

| Server       | Language                |
| ------------ | ----------------------- |
| basedpyright | Python                  |
| lua_ls       | Lua                     |
| eslint       | JavaScript / TypeScript |
| svelte       | Svelte                  |
| vue_ls       | Vue                     |

TypeScript/Vue is primarily handled by [typescript-tools.nvim](https://github.com/pmizio/typescript-tools.nvim) (configured in `lua/plugins/lsp.lua`), not a standalone `lsp/*.lua` server.

### Formatting & Linting

- **[conform.nvim](https://github.com/stevearc/conform.nvim)** — StyLua, prettierd, black+isort. Format on save.
- **[nvim-lint](https://github.com/mfussenegger/nvim-lint)** — ruff, hadolint (Lua lints via `lua_ls` LSP)

### Debugging

nvim-dap + nvim-dap-ui for JavaScript/TypeScript and Python.

### Testing

neotest with `<leader>t` prefix.

## Customization

Create `nvim/.config/nvim/lua/custom-settings.lua` (gitignored) for machine-specific settings. Loaded via `pcall` so it's optional.

## Directory Layout

```
nvim/.config/nvim/
├── lua/config/      # Core config (LSP, keymaps, diagnostics)
├── lua/plugins/     # Plugin specs (Lazy.nvim)
└── lsp/             # Per-server LSP configs
```
