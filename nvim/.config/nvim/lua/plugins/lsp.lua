return {
  "neovim/nvim-lspconfig",
  {
    "pmizio/typescript-tools.nvim",
    dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
    opts = {
      filetypes = {
        "javascript",
        "javascriptreact",
        "typescript",
        "typescriptreact",
        "vue",
      },
      settings = {
        tsserver_plugins = {
          "@vue/typescript-plugin",
        },
        separate_diagnostic_server = true,
        publish_diagnostic_on = "insert_leave",
        tsserver_max_memory = "auto",
        expose_as_code_action = "all",
      },
    },
  },
  {
    "williamboman/mason.nvim",
    dependencies = {
      "neovim/nvim-lspconfig",
      "williamboman/mason-lspconfig.nvim",
      "b0o/schemastore.nvim",
      "saghen/blink.cmp",
    },
    config = function()
      require("mason").setup()
    end,
  },
}
