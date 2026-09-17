local lsp_servers = { "astro", "tailwindcss" }
local disabled = { snyk_ls = true }

--- Tailwind v4 no longer requires a `tailwind.config.*`, so projects that
--- configure it from CSS (e.g. via `@tailwindcss/vite`) have no file-based
--- root marker. Fall back to the nearest `package.json` that depends on
--- tailwindcss.
---@param fname string
---@return string|nil
local function tailwind_package_json(fname)
  local candidates = vim.fs.find("package.json", { path = fname, upward = true, limit = math.huge })
  for _, path in ipairs(candidates) do
    local ok, pkg = pcall(function()
      return vim.json.decode(table.concat(vim.fn.readfile(path), "\n"))
    end)
    if ok and type(pkg) == "table" then
      for _, field in ipairs({ "dependencies", "devDependencies" }) do
        if type(pkg[field]) == "table" and pkg[field].tailwindcss then
          return path
        end
      end
    end
  end
end

vim.lsp.config("tailwindcss", {
  settings = {
    tailwindCSS = {
      validate = true,
      -- Complete/validate classes inside helper calls, e.g. cn("px-3 py-1.5")
      classFunctions = { "cn", "cva", "clsx", "cx", "tw", "twMerge" },
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
    local found = vim.fs.find(root_files, { path = fname, upward = true })[1] or tailwind_package_json(fname)
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
