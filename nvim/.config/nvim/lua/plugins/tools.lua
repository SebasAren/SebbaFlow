return {
  {
    "lukas-reineke/indent-blankline.nvim",
    config = function()
      require("ibl").setup({
        exclude = {
          filetypes = { "markdown" },
        },
      })
    end,
  }, -- indent lines
  -- REVIEW-TEST: added comment for review testing
  {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    branch = "main",
    config = function()
      local treesitter = require("nvim-treesitter")
      local ts_config = require("config.treesitter-autocmd")
      ts_config.setup()
      -- Resolve filetypes to parser languages (e.g. jsonc -> json) and dedupe
      local langs = {}
      for _, ft in ipairs(ts_config.filetypes) do
        langs[vim.treesitter.language.get_lang(ft) or ft] = true
      end
      treesitter.install(vim.tbl_keys(langs))
    end,
  },
  {
    "windwp/nvim-ts-autotag",
    opts = {},
    lazy = false,
  },
  -- Python
  {
    "linux-cultist/venv-selector.nvim",
    opts = {},
    ft = "python",
  },
  { "nvim-tree/nvim-web-devicons", lazy = true },
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
      -- your configuration comes here
      -- or leave it empty to use the default settings
      -- refer to the configuration section below
    },
    keys = {
      {
        "<leader>?",
        function()
          require("which-key").show({ global = false })
        end,
        desc = "Buffer Local Keymaps (which-key)",
      },
    },
  },
  {
    "folke/flash.nvim",
    event = "VeryLazy",
    opts = {},
    keys = {
      {
        "<leader>s",
        mode = { "n", "x", "o" },
        function()
          require("flash").jump()
        end,
        desc = "Flash",
      },
      {
        "<leader>S",
        mode = { "n", "x", "o" },
        function()
          require("flash").treesitter()
        end,
        desc = "Flash Treesitter",
      },
      {
        "r",
        mode = "o",
        function()
          require("flash").remote()
        end,
        desc = "Remote Flash",
      },
      {
        "R",
        mode = { "o", "x" },
        function()
          require("flash").treesitter_search()
        end,
        desc = "Treesitter Search",
      },
      {
        "<c-s>",
        mode = { "c" },
        function()
          require("flash").toggle()
        end,
        desc = "Toggle Flash Search",
      },
    },
  },
}
