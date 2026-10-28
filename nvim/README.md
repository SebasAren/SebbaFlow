# Neovim Configuration

Requires **Neovim 0.11+** (native `vim.lsp.config` / `vim.lsp.enable`).

Lazy.nvim-based Neovim config with 16 LSP servers, AI-assisted completion, and extensive plugin suite.

## Setup

```bash
stow nvim
nvim --headless "+Lazy! sync" +qa   # install plugins
```

LSP servers are managed by Mason (`:Mason` in Neovim). The config auto-installs servers on first use.

## Plugin Ecosystem

### Completion

[blink.cmp](https://github.com/Saghen/blink.cmp) with LSP, snippet, path, and buffer sources.

### LSP

18 servers registered via native `vim.lsp.config` / `vim.lsp.enable` (Neovim 0.11+). Mason (`:Mason`) installs servers; `mason-lspconfig` bridges install names. Per-server configs in `lsp/*.lua`. Key servers:

| Server        | Language                           |
| ------------- | ---------------------------------- |
| basedpyright  | Python                             |
| lua_ls        | Lua                                |
| eslint        | JavaScript / TypeScript            |
| svelte        | Svelte                             |
| vue_ls        | Vue                                |
| ruby_lsp      | Ruby / Rails                       |
| cssls         | CSS / SCSS / Less                  |
| css_variables | CSS custom properties across files |

Multi-brand CSS: when token files scope the same custom properties under `[data-brand="x"]` (default brand on `:root`), `css_variables` resolves one brand at a time — it follows the brand file you open, or pick one with `:CssBrand` (`lua/config/css-brand.lua`).

Colour previews (`textDocument/documentColor` from cssls, css_variables, tailwindcss) use Neovim's built-in `vim.lsp.document_color`, which needs **Neovim 0.12+** — on 0.11 everything else works, just without swatches.

TypeScript/Vue is primarily handled by [typescript-tools.nvim](https://github.com/pmizio/typescript-tools.nvim) (configured in `lua/plugins/lsp.lua`), not a standalone `lsp/*.lua` server.

### Formatting & Linting

- **[conform.nvim](https://github.com/stevearc/conform.nvim)** — StyLua, prettierd, black+isort, rubocop. Format on save.
- **[nvim-lint](https://github.com/mfussenegger/nvim-lint)** — ruff, hadolint (Lua lints via `lua_ls` LSP)

### Debugging

nvim-dap + nvim-dap-ui for JavaScript/TypeScript and Python.

### Testing

neotest with `<leader>t` prefix. Adapters: neotest-python, neotest-vitest, neotest-rspec (Ruby/RSpec).

### GitLab

**[gitlab.nvim](https://github.com/harrisoncramer/gitlab.nvim)** — review MRs (diffs via diffview-plus, discussions, approvals) with the default `gl` keymaps (`glS` start review, `glC` create MR). Needs Go from Homebrew (`brew "go"` in the Brewfile) to build its local server, and auth from a `.gitlab.nvim` file (`auth_token=…`) in the project root, `GITLAB_TOKEN`, or — as a fallback — the token `glab auth login` stored in the keyring.

## Customization

Create `nvim/.config/nvim/lua/custom-settings.lua` (gitignored) for machine-specific settings. Loaded via `pcall` so it's optional.

## Directory Layout

```
nvim/.config/nvim/
├── lua/config/      # Core config (LSP, keymaps, diagnostics)
├── lua/plugins/     # Plugin specs (Lazy.nvim)
└── lsp/             # Per-server LSP configs
```
