---
description: pi provider auth in models.json and what /reload does not reload
globs: ["pi/.pi/agent/models.json"]
---

## Provider-level apiKey is required for env-var-only providers

pi's branch-summarization (`/kickoff`) and compaction (`/compact`) auth paths call `getApiKeyAndHeaders({ includeFallback: false })`, which **skips pure env-var resolution**. A provider that relies only on an env var (`ZAI_API_KEY`, `OPENCODE_API_KEY`) works for normal turns but fails in these paths with `No API key found for <provider>`.

A provider-level `apiKey: "$ENV_VAR"` in `models.json` is returned directly by all auth paths, so it fixes both. Any env-var-only provider needs this entry — if you add one, add its `apiKey` too or `/kickoff` and `/compact` will silently break.

## /reload does not re-read models.json

`/reload` reloads only keybindings, extensions, skills, prompts, and themes. To pick up `models.json` changes, restart pi.
