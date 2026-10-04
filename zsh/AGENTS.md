# Zsh Configuration

Modular zsh config, parallel to the `bashrc` stow. Entry point: `.zshenv`
(env vars, sourced by zsh for every invocation), then `.zshrc` sources all
files in `.zshrc.d/`.

## Structure

```
.zshenv              # Global env vars (XDG, EDITOR, LESS, Homebrew shellenv)
.zshrc                # Sources everything in .zshrc.d/
.zshrc.d/             # sourced in glob (alphabetical) order
  00-plugins          # zinit bootstrap + plugin set + compinit + prompt/nav tools
  alias               # Short aliases
  dotenv              # Auto-source .env on cd (OMZ dotenv snippet via zinit)
  fnox                # fnox reencryption helper
  mise                # Activates mise/fnox/pitchfork (skipped inside herdr), asdf shims ahead of mise
```

`00-plugins` is numbered so it sources first — it runs `compinit`, which
defines `compdef`. Anything sourcing a tool's zsh completion (`mise completion
zsh` starts with `#compdef mise` and calls `compdef _mise 'mise'`) must come
after it, or the shell prints `zsh: command not found: compdef` on start.

## Why zinit instead of Oh My Zsh

Oh My Zsh eagerly sources its whole framework plus every enabled plugin on
every shell start, which adds up. [zinit](https://github.com/zdharma-continuum/zinit)
lazy-loads and only pulls in what `plugins` actually declares:

- `zsh-users/zsh-completions` — extra completion definitions
- `zsh-users/zsh-autosuggestions` — fish-style history suggestions
- `zsh-users/zsh-syntax-highlighting` — must load last; it wraps zle widgets
  the other plugins define

`.zshrc.d/dotenv` pulls one more as a standalone snippet (`OMZP::dotenv`),
kept in its own file because its settings must be exported _before_ the
snippet loads — the plugin resolves them with `: ${VAR:=default}` at source
time. Without oh-my-zsh, `$ZSH`/`$ZSH_CACHE_DIR` are unset, so its allow/deny
lists would default to `/cache/dotenv-*.list`, which `touch` cannot create —
every prompt would print an error. `ZSH_DOTENV_ALLOWED_LIST` and
`ZSH_DOTENV_DISALLOWED_LIST` therefore point at `$XDG_STATE_HOME/zsh/`.

It overlaps with direnv (below): direnv is the safer tool — `.envrc` is
explicitly `direnv allow`-ed and variables unload on leaving the directory,
whereas dotenv exports into the shell and they persist. dotenv earns its
place for plain `.env` files that direnv would not read without an `.envrc`
shim. On first visit to a directory it prompts (`[y]es/[N]o/[a]lways/n[e]ver`);
`a`/`e` record the answer in the lists above.

Those lists are matched with `grep -Fx` — exact literal paths, no prefixes. git
worktrees get a fresh directory per branch (`~/.herdr/worktrees/<repo>/<branch>`),
so `[a]lways` in one worktree does nothing for the next and every new branch
re-prompts. `.zshrc.d/dotenv` therefore wraps `source_env` with a trusted-prefix
check: any directory under an entry in `ZSH_DOTENV_ALLOWED_PREFIXES` (default:
`~/.herdr/worktrees`) is sourced with `ZSH_DOTENV_PROMPT=false`. Add a prefix to
that array to trust another subtree wholesale; everything outside one still
prompts normally. Trusted prefixes bypass the deny list too.

The plugin also calls `source_env` once at load time, for the shell's starting
directory — before any wrapper exists, so a pane opened straight into a
worktree would still prompt. The snippet is therefore loaded with
`ZSH_DOTENV_FILE=/dev/null/.env` (a path that cannot exist, making that call a
no-op), and the file re-runs `source_env` itself as its last line.

The same file also makes parsing fault-tolerant. The plugin parses values with
zsh's own tokenizer, so it first runs `zsh -fn` over the whole file and drops
_everything_ if that fails — one stray quote (`FOO = '''`) leaves a string open
to EOF and reports `.env:<lastline>: unmatched '`, losing every well-formed
variable in the file. `_dotenv_check_syntax` is therefore wrapped to record the
verdict rather than abort, and `parse_dotenv` to fall back to `_dotenv_sanitize`
when it failed: a line-oriented normalizer that tolerates `export ` prefixes and
spaces around `=`, keeps genuine multi-line quoted values, re-quotes an
unbalanced value literally with `${(qq)}`, and warns which line was bad. Files
that pass `zsh -fn` take the original path untouched, so this costs nothing in
the normal case. The pipe branch of `source_env` still fails hard — it parses
content directly without going through `parse_dotenv`.

Zinit self-installs on first shell start (clones into
`${XDG_DATA_HOME}/zinit/zinit.git`) — no separate setup step needed, but the
first new shell will pause briefly for the `git clone`.

Prompt (Starship), directory jumping (zoxide), and env loading (direnv) are
each activated only if installed (`command -v` guard) — same convention as
`bashrc/.bashrc.d/mise`.

## Conventions

Same as [`bashrc/AGENTS.md`](../bashrc/AGENTS.md): one concern per file, guard
tool activation with `command -v`, functions override binaries via a
`_toolname_bin` captured path.

## Usage

```bash
stow zsh    # install
stow -D zsh # uninstall — removes the symlinks
```

Then make zsh (if not already) or point it at this config — zsh already
reads `~/.zshenv`/`~/.zshrc` by default, no shell switch needed on macOS.
