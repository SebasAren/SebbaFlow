---
name: obsidian-wiki-query
description: Query the personal wiki.
---

# Query the Wiki

Answer questions from the wiki at `~/Documents/wiki/`. All domains welcome.

## Search Algorithm

Stop when you have enough to answer.

### Step 1 — wiki_search

```
wiki_search:0 {"query": "<keywords>", "top": 5}
```

Returns `content[0].text` (snippets) and `details.paths` (full paths). Snippets are match context, not summaries — `read` the full files.

Try multiple search terms with wiki-specific terminology (e.g., "agent swarm" not "multi-agent AI").

Manual fallback:
```bash
rg -il "<keyword>" ~/Documents/wiki/wiki/
rg -i -C 2 "<phrase>" ~/Documents/wiki/wiki/
```

### Step 2 — Follow wiki links

Pages use `[[wiki-link]]` cross-references. Read linked pages — the link graph surfaces context the initial search missed.

### Step 3 — Synthesize

Answer with `[[wiki links]]` citations. If valuable, ask user about saving to `wiki/analysis/<slug>.md`.

## Page Types

| Directory | Content |
|-----------|---------|
| `wiki/concepts/` | Definitions, properties, comparisons |
| `wiki/entities/` | People, orgs, tools, models |
| `wiki/sources/` | Source summaries |
| `wiki/synthesis/` | High-level overviews spanning sources |
| `wiki/analysis/` | Filed-back answers, comparisons |

If nothing relevant found, say so. Don't fabricate.
