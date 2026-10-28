--- Brand selection for css-variables-language-server.
---
--- The server indexes custom properties in one global map keyed by name, so
--- when several brands declare the same token (`--heading-1-color` under
--- `:root` and under `[data-brand="independer"]`) the last file scanned wins.
--- We pick one brand at a time and hide the other brands' token files through
--- the server's `blacklistFolders` (fast-glob `ignore`) setting.
---
--- Brand files are found by convention: a CSS file whose rule opens with a
--- single `[data-brand="x"] {` selector belongs to brand `x`; the other CSS
--- files in that directory (on `:root`) belong to the default brand.

local M = {}

---@type table<string, table<string, string>> root -> relative path -> brand
local brand_files = {}
---@type table<string, string> root -> active brand
local active = {}
---@type table<string, string> root -> brand on `:root`, active until another is picked
local root_brand = {}
---@type table<string, string[]> root -> blacklistFolders before brand globs
local base_ignore = {}

local DEFAULT = "default"

---@param root string
---@return table<string, string> files relative path -> brand
---@return string|nil root_brand name of the `:root` brand, if it has files
local function scan(root)
  local ok, obj = pcall(vim.system, { "rg", "--files-with-matches", "--glob", "*.css", [[\[data-brand="]], root })
  if not ok then
    return {}
  end
  local result = obj:wait()
  local files, dirs = {}, {}
  for path in (result.stdout or ""):gmatch("[^\n]+") do
    local brands = {}
    for _, line in ipairs(vim.fn.readfile(path)) do
      local brand = line:match('^%s*%[data%-brand="([%w_-]+)"%]%s*{')
      if brand then
        brands[brand] = true
      end
    end
    local names = vim.tbl_keys(brands)
    if #names == 1 then
      files[path] = names[1]
      dirs[vim.fs.dirname(path)] = true
    end
  end

  for dir in pairs(dirs) do
    for name, type in vim.fs.dir(dir) do
      local path = vim.fs.joinpath(dir, name)
      if type == "file" and name:match("%.css$") and not files[path] then
        files[path] = DEFAULT
      end
    end
  end

  -- Name the default brand after its files when they share a stem
  -- (palette/frits.css + semantic/frits.css -> "frits")
  local stems = {}
  for path, brand in pairs(files) do
    if brand == DEFAULT then
      stems[vim.fn.fnamemodify(path, ":t:r")] = true
    end
  end
  local stem_names = vim.tbl_keys(stems)
  local default_name = #stem_names == 1 and stem_names[1] or DEFAULT

  local relative = {}
  for path, brand in pairs(files) do
    relative[path:sub(#root + 2)] = brand == DEFAULT and default_name or brand
  end
  return relative, #stem_names > 0 and default_name or nil
end

---@param root string
local function rescan(root)
  brand_files[root], root_brand[root] = scan(root)
end

---@param root string
---@return string[]
function M.brands(root)
  local seen = {}
  for _, brand in pairs(brand_files[root] or {}) do
    seen[brand] = true
  end
  local names = vim.tbl_keys(seen)
  table.sort(names)
  return names
end

---@param root string
---@param brand string
---@param base string[]
---@return string[]
local function ignore_globs(root, brand, base)
  local globs = vim.deepcopy(base)
  for path, file_brand in pairs(brand_files[root] or {}) do
    if file_brand ~= brand then
      table.insert(globs, path)
    end
  end
  return globs
end

---@param bufnr integer
---@return vim.lsp.Client|nil
local function client_for(bufnr)
  return vim.lsp.get_clients({ bufnr = bufnr, name = "css_variables" })[1]
end

---@param client vim.lsp.Client
---@param brand string
local function apply(client, brand)
  local root = assert(client.root_dir)
  active[root] = brand
  client.settings.cssVariables.blacklistFolders = ignore_globs(root, brand, base_ignore[root] or {})
  -- The server clears its cache and rescans the workspace on this notification
  client:notify("workspace/didChangeConfiguration", { settings = client.settings })

  -- Built-in document colours only re-request on edits; toggling them makes
  -- each buffer request again against the rescanned brand
  vim.defer_fn(function()
    if not vim.lsp.document_color then
      return -- Neovim < 0.12
    end
    for bufnr in pairs(client.attached_buffers) do
      local filter = { bufnr = bufnr }
      if vim.api.nvim_buf_is_loaded(bufnr) and vim.lsp.document_color.is_enabled(filter) then
        vim.lsp.document_color.enable(false, filter)
        vim.lsp.document_color.enable(true, filter)
      end
    end
  end, 300)
end

--- Exclude non-default brands before the server's first scan.
---@param config vim.lsp.ClientConfig
function M.before_init(config)
  local root = config.root_dir
  if not root then
    return
  end
  rescan(root)
  local brand = active[root] or root_brand[root] or M.brands(root)[1]
  if not brand then
    return
  end
  active[root] = brand
  local settings = config.settings.cssVariables
  base_ignore[root] = vim.deepcopy(settings.blacklistFolders or {})
  settings.blacklistFolders = ignore_globs(root, brand, base_ignore[root])
end

--- Switch to the brand of the buffer's file, if it is a brand token file.
---@param bufnr integer
function M.follow(bufnr)
  local client = client_for(bufnr)
  local root = client and client.root_dir
  if not client or not root then
    return
  end
  local path = vim.api.nvim_buf_get_name(bufnr)
  local brand = (brand_files[root] or {})[path:sub(#root + 2)]
  if brand and brand ~= active[root] then
    apply(client, brand)
    vim.notify("CSS variables: " .. brand .. " brand", vim.log.levels.INFO)
  end
end

vim.api.nvim_create_autocmd("BufEnter", {
  group = vim.api.nvim_create_augroup("my.css_brand", {}),
  pattern = { "*.css", "*.scss", "*.less" },
  callback = function(args)
    M.follow(args.buf)
  end,
})

vim.api.nvim_create_user_command("CssBrand", function(opts)
  local client = client_for(0)
  local root = client and client.root_dir
  if not client or not root then
    vim.notify("CssBrand: css_variables is not attached to this buffer", vim.log.levels.WARN)
    return
  end
  rescan(root)
  local brands = M.brands(root)
  if #brands == 0 then
    vim.notify("CssBrand: no [data-brand] token files under " .. root, vim.log.levels.WARN)
    return
  end

  local function select(brand)
    if not brand then
      return
    end
    if not vim.tbl_contains(brands, brand) then
      vim.notify("CssBrand: unknown brand " .. brand, vim.log.levels.ERROR)
      return
    end
    apply(client, brand)
    vim.notify("CSS variables: " .. brand .. " brand", vim.log.levels.INFO)
  end

  if opts.args ~= "" then
    select(opts.args)
  else
    vim.ui.select(brands, {
      prompt = "CSS brand (active: " .. (active[root] or "none") .. ")",
    }, select)
  end
end, {
  nargs = "?",
  desc = "Pick which brand's tokens css_variables resolves",
  complete = function()
    local client = client_for(0)
    return client and client.root_dir and M.brands(client.root_dir) or {}
  end,
})

return M
