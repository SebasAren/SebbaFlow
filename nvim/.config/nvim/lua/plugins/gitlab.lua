-- GitLab merge request review (discussions, comments, approvals) inside Neovim.
-- Needs Go (Homebrew) to build its local server. Global keymaps live under the
-- `gl` prefix.

-- Auth: a `.gitlab.nvim` file or GITLAB_TOKEN wins (the plugin's defaults);
-- otherwise reuse the token glab keeps in the OS keyring. glab 1.120 has no
-- `auth token` command and `config get token` skips the keyring, so read it
-- from `auth status --show-token` ("Token found in ...: <token>").
-- Only personal access tokens work: the Go server sends the token as
-- PRIVATE-TOKEN, which GitLab rejects (401) for glab's OAuth logins.
local function auth_provider()
  local token, url, err = require("gitlab.state").default_auth_provider()
  if err ~= nil or (token ~= nil and token ~= "") then
    return token, url, err
  end
  if vim.fn.executable("glab") == 0 then
    return nil, url, nil
  end

  local host = (url or "https://gitlab.com"):gsub("^%a+://", ""):gsub("/.*$", "")
  local is_oauth = vim.system({ "glab", "config", "get", "is_oauth2", "--host", host }, { text = true }):wait(5000)
  if vim.trim(is_oauth.stdout or "") == "true" then
    vim.notify(
      "gitlab.nvim: glab is logged in via OAuth, which the Go server can't use. "
        .. "Set GITLAB_TOKEN or run `glab auth login --stdin` with a personal access token.",
      vim.log.levels.WARN
    )
    return nil, url, nil
  end

  local cmd = { "glab", "auth", "status", "--hostname", host, "--show-token" }
  local result = vim.system(cmd, { text = true }):wait(5000)
  local output = (result.stdout or "") .. (result.stderr or "")
  for line in output:gmatch("[^\n]+") do
    local glab_token = line:match("Token[^:]*:%s*(%S+)%s*$")
    if glab_token and not glab_token:match("^%*+$") then
      return glab_token, url, nil
    end
  end
  return nil, url, nil
end

-- The plugin's reload_review only re-reads the MR's diff refs from GitLab; it
-- never fetches, so a head SHA pushed since the last fetch isn't in the local
-- repo and diffview silently keeps the old diff. Commenting also refuses while
-- the checked-out branch is behind its upstream. So with the MR branch checked
-- out, fast-forward it; otherwise fetch the MR ref (works for fork MRs too).
-- Then reload and refresh the discussion tree.
local function reload_review()
  local state = require("gitlab.state")
  local iid = state.INFO and state.INFO.iid
  if not require("gitlab.reviewer").is_open or iid == nil then
    vim.notify("gitlab.nvim: no review open", vim.log.levels.WARN)
    return
  end

  local cmd
  if require("gitlab.git").get_current_branch() == state.INFO.source_branch then
    cmd = { "git", "pull", "--ff-only" }
  else
    local remote = state.settings.connection_settings.remote
    cmd = { "git", "fetch", remote, string.format("refs/merge-requests/%d/head", iid) }
  end
  vim.system(cmd, { text = true }, function(result)
    vim.schedule(function()
      if result.code ~= 0 then
        local msg = string.format("gitlab.nvim: `%s` failed: %s", table.concat(cmd, " "), vim.trim(result.stderr or ""))
        vim.notify(msg, vim.log.levels.ERROR)
        return
      end
      vim.cmd.checktime() -- Reload buffers the pull changed on disk
      local gitlab = require("gitlab")
      gitlab.reload_review()
      if require("gitlab.actions.discussions").split_visible then
        gitlab.refresh_data()
      end
    end)
  end)
end

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
    keys = {
      { "gl<C-r>", reload_review, desc = "Pull MR changes and reload GitLab review" },
    },
    ---@type GitlabSettings
    opts = {
      auth_provider = auth_provider,
      keymaps = {
        global = { reload_review = false }, -- Replaced by the fetching wrapper above
      },
    },
  },
}
