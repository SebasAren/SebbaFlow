return {
  {
    "saghen/blink.cmp",
    version = "1.*",
    dependencies = {
      "echasnovski/mini.nvim",
    },
    ---@module 'blink.cmp'
    ---@type blink.cmp.Config
    opts = {
      keymap = {
        preset = "none",
        ["<C-space>"] = { "show", "show_documentation", "fallback" },
        ["<C-e>"] = { "cancel" },
        ["<Tab>"] = { "select_next", "fallback" },
        ["<C-n>"] = { "select_next", "fallback" },
        ["<S-Tab>"] = { "select_prev", "fallback" },
        ["<C-p>"] = { "select_prev", "fallback" },
        ["<C-y>"] = { "accept", "fallback" },
        ["<CR>"] = { "accept", "fallback" },
        ["<C-f>"] = { "scroll_documentation_down" },
        ["<C-b>"] = { "scroll_documentation_up" },
      },
      signature = { enabled = true },
      appearance = {
        nerd_font_variant = "mono",
      },
      completion = {
        list = {
          selection = {
            preselect = false,
          },
          cycle = {
            from_top = false,
          },
        },
        documentation = {
          auto_show = true,
        },
      },
      fuzzy = {
        implementation = "prefer_rust_with_warning",
      },
      snippets = { preset = "mini_snippets" },
      sources = {
        default = { "lsp", "path", "snippets", "buffer" },
        providers = {},
      },
    },
    opts_extend = { "sources.default" },
  },
}
