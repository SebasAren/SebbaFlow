local css_settings = {
  validate = true,
  lint = {
    -- Tailwind directives (@apply, @tailwind, @theme, @utility, ...) aren't
    -- standard CSS; tailwindcss LSP handles them instead
    unknownAtRules = "ignore",
  },
}

---@type vim.lsp.Config
return {
  settings = {
    css = css_settings,
    scss = css_settings,
    less = css_settings,
  },
}
