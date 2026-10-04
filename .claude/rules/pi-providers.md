---
description: pi provider auth and what /reload does not reload
globs: ["pi/.pi/agent/models.json"]
---

## Provider auth comes from auth.json

pi's auth resolution order: stored credential (`~/.pi/agent/auth.json`, written by `/login`) **owns the provider** — env vars are only consulted when nothing is stored. Keep provider keys in auth.json; do not add provider-level `apiKey: "$ENV_VAR"` entries in `models.json`. The historical workaround for `/kickoff`/`/compact` (provider-level apiKey because `includeFallback:false` skipped env resolution) is obsolete as of pi 0.99.x — all auth paths resolve stored credentials first.

## /reload does not re-read models.json

/reload reloads only keybindings, extensions, skills, prompts, and themes. To pick up `models.json` changes, restart pi.
