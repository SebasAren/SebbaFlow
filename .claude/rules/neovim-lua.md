---
globs:
  - "*.lua"
  - "nvim/**/*.lua"
description: Neovim Lua conventions
---

- Use 2-space indentation (StyLua formatting)
- Use `---@type` annotations for LuaLS
- Use `snake_case` for variables and functions
- Prefer `vim.keymap.set` over legacy `vim.api.nvim_set_keymap`
- Use `pcall` for requiring optional modules

## Neovim Version Gate

- **`vim.lsp.config()` / `vim.lsp.enable()` require Neovim 0.11+**. If a config uses these APIs, document the minimum version in `nvim/README.md`.

## Plugin Loading

- **Mason.nvim does not need `lazy = false`**. Remove `lazy = false` from `mason.nvim` specs — it increases startup time without benefit.

- `<C-CR>` (Ctrl+Enter) does **not** work in most terminals — they send the same escape sequence as plain `<CR>`, so Neovim cannot distinguish them. Use an alternative like `<C-s>`, `<C-m>` (same as Enter in most terms), or `<Esc><CR>` instead.

## fzf-lua API Gotchas

- `fzf-lua.changes()` → Neovim's **buffer edit history** (`:changes`), NOT git changes
