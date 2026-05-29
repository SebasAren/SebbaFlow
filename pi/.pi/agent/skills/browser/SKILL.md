---
name: browser
description: Browser automation via agent-browser. Use when the user wants to browse, interact with, or inspect web pages.
---

# Browser Automation

> ⚠️ Use `agent-browser` only. Do NOT use `playwright`, `playwright-cli`, `npx playwright`, or `npx @playwright/cli`.

## Core Loop

```bash
agent-browser open https://example.com   # launch headless browser
agent-browser snapshot -i                # interactive elements with refs (@e1, @e2…)
agent-browser click @e3                  # interact using refs
agent-browser fill @e5 "hello"           # fill text field
agent-browser press Enter                # press a key
agent-browser close                      # close browser
```

Refs go stale after every page change — always re-snapshot before the next interaction.

## Waiting (critical for reliability)

```bash
agent-browser wait @e1                    # wait for element
agent-browser wait --text "Success"       # wait for text
agent-browser wait --load networkidle     # wait for network idle
```

Prefer these over bare `agent-browser wait 2000` (dumb wait).

## Connect to existing browser (CDP)

When the user says "connect to my browser", "check the layout", "inspect the page", etc. — they have a browser running on `localhost:9222`.

```bash
agent-browser connect 9222          # connect once
agent-browser snapshot -i           # then run commands without --cdp
agent-browser tab list              # discover open tabs (stable IDs)
agent-browser tab new "http://url.com"  # use tab new, not open (timeouts via CDP)
```

Or pass `--cdp` on each command: `agent-browser --cdp 9222 snapshot`.

## Key patterns

```bash
agent-browser find role button click --name "Submit"   # semantic locators (no snapshot)
agent-browser eval "document.title"                    # run JS, inspect state
agent-browser screenshot --full                         # capture full page
agent-browser close --all                               # cleanup
```

Full reference: `agent-browser --help`
