-- GitLab merge request review (discussions, comments, approvals) inside Neovim.
-- Needs Go (Homebrew) to build its local server, and GITLAB_TOKEN (or a
-- `.gitlab.nvim` file in the project root) for auth. Global keymaps live
-- under the `gl` prefix.
return {
  {
    "harrisoncramer/gitlab.nvim",
    event = "VeryLazy",
    dependencies = {
      "MunifTanjim/nui.nvim",
      "dlyongemallo/diffview-plus.nvim", -- Maintained fork of sindrets/diffview.nvim
      "nvim-tree/nvim-web-devicons",
    },
    build = function()
      require("gitlab.server").build(true)
    end,
    ---@type GitlabSettings
    opts = {},
  },
}
