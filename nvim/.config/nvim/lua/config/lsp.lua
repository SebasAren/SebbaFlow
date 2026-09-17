local lsp_servers = { "astro", "tailwindcss" }
local disabled = { snyk_ls = true }

vim.lsp.config("tailwindcss", {
  settings = {
    tailwindCSS = {
      experimental = {
        classRegex = {},
      },
      validate = true,
    },
  },
  before_init = function(_, config)
    config.settings = config.settings or {}
    config.settings.editor = config.settings.editor or {}
    if not config.settings.editor.tabSize then
      config.settings.editor.tabSize = vim.lsp.util.get_effective_tabstop()
    end
  end,
  root_dir = function(bufnr, on_dir)
    local fname = vim.api.nvim_buf_get_name(bufnr)
    if fname:find("/%.claude/worktrees/") then
      return
    end
    local root_files = {
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
      "tailwind.config.ts",
      "postcss.config.js",
      "postcss.config.cjs",
      "postcss.config.mjs",
      "postcss.config.ts",
    }
    local found = vim.fs.find(root_files, { path = fname, upward = true })[1]
    if found then
      on_dir(vim.fs.dirname(found))
    end
  end,
})

vim.lsp.config("astro", {
  init_options = {
    typescript = {
      tsdk = vim.fn.getcwd() .. "/node_modules/typescript/lib",
    },
  },
})

for _, file in ipairs(vim.fn.readdir(vim.fn.stdpath("config") .. "/lsp")) do
  local server_name = file:match("(.+)%..+$")
  if server_name and not disabled[server_name] then
    table.insert(lsp_servers, server_name)
  end
end

vim.lsp.enable(lsp_servers)

require("mason-lspconfig").setup({
  automatic_enable = false,
  ensure_installed = { "svelte", "vue_ls", "ruby_lsp" },
})
