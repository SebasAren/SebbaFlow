---@param value number
---@return number
local function clamp(value)
  return math.min(math.max(value, 0), 1)
end

---@type vim.lsp.Config
return {
  -- Multi-brand projects declare the same token per brand; resolve one brand
  -- at a time (`:CssBrand`, or follows the brand file you open)
  before_init = function(_, config)
    require("config.css-brand").before_init(config)
  end,
  -- The server converts oklch() to sRGB without clamping, so in-gamut colours
  -- come back as e.g. green = 1.0000121. Neovim's document colour handler
  -- turns that into an invalid hex code and errors. It calls client:request
  -- with its own callback (bypassing `handlers`), so clamp at the request.
  on_init = function(client)
    local request = client.request
    ---@diagnostic disable-next-line: duplicate-set-field
    client.request = function(self, method, params, handler, bufnr)
      if method == "textDocument/documentColor" and handler then
        local inner = handler
        handler = function(err, result, ...)
          for _, info in ipairs(result or {}) do
            for channel, value in pairs(info.color) do
              info.color[channel] = clamp(value)
            end
          end
          return inner(err, result, ...)
        end
      end
      return request(self, method, params, handler, bufnr)
    end
  end,
}
