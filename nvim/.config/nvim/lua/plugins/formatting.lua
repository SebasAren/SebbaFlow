return {
  "stevearc/conform.nvim",
  event = { "BufWritePre" },
  cmd = { "ConformInfo" },
  keys = {
    {
      "<leader>tf",
      function()
        if vim.g.disable_autoformat then
          vim.g.disable_autoformat = false
          vim.notify("Auto format enabled", vim.log.levels.WARN)
        else
          vim.g.disable_autoformat = true
          vim.notify("Auto format disabled", vim.log.levels.WARN)
        end
      end,
      desc = "Toggle auto format on save",
    },
  },
  init = function()
    vim.o.formatexpr = "v:lua.require'conform'.formatexpr()"
  end,
  ---@type conform.setupOpts
  opts = {
    formatters_by_ft = {
      python = { "isort", "black" },
      lua = { "stylua" },
      javascript = { "prettierd" },
      javascriptreact = { "prettierd" },
      typescript = { "prettierd" },
      typescriptreact = { "prettierd" },
      vue = { "prettierd" },
      graphql = { "prettierd" },
      prisma = { "prettierd" },
      html = { "prettierd" },
      ruby = { "rubocop" },
      ["*"] = { "trim_whitespace" },
    },
    format_on_save = function()
      if vim.g.disable_autoformat then
        return
      end
      return { timeout_ms = 1000, lsp_format = "fallback" }
    end,
  },
}
