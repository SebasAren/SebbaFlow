local M = {}

M.filetypes = {
  "bash",
  "c",
  "css",
  "diff",
  "html",
  "javascript",
  "javascriptreact",
  "jsdoc",
  "json",
  "jsonc",
  "lua",
  "luadoc",
  "luap",
  "markdown",
  "markdown_inline",
  "printf",
  "python",
  "query",
  "regex",
  "toml",
  "typescript",
  "typescriptreact",
  "vim",
  "vimdoc",
  "vue",
  "svelte",
  "xml",
  "yaml",
  "prisma",
  "graphql",
  "astro",
  "http",
}

M.markdown_line_threshold = 3000

function M.setup()
  -- JSX: the javascript parser cannot parse JSX tags; use the tsx parser for .jsx files
  vim.treesitter.language.register("tsx", "javascriptreact")

  vim.api.nvim_create_augroup("TreesitterAutoAttach", { clear = true })

  vim.api.nvim_create_autocmd("FileType", {
    pattern = M.filetypes,
    group = "TreesitterAutoAttach",
    callback = function()
      local ft = vim.bo.filetype
      local line_count = vim.api.nvim_buf_line_count(0)

      -- Skip treesitter for large markdown files (markdown_inline parser is very expensive)
      if ft == "markdown" and line_count > M.markdown_line_threshold then
        return
      end

      vim.treesitter.start()
      if ft ~= "markdown" then
        vim.wo[0][0].foldexpr = "v:lua.vim.treesitter.foldexpr()"
        vim.wo[0][0].foldmethod = "expr"
        vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
      end
    end,
  })
end

return M
