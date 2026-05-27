---
name: obsidian-wiki-maintain
description: Wiki health checks.
---

# Maintain the Wiki

Health checks and maintenance for the wiki at `~/Documents/wiki/`.

## Wiki Status

**Trigger:** `/skill:obsidian-wiki-maintain status`

Report:
- Page count by category (`find wiki/concepts/ -name '*.md' | wc -l`, etc.)
- Inbox contents: `ls raw/inbox/`
- Topical coverage overview: run `wiki_search` with key topics to spot-check coverage
- Any obvious issues

## Lint the Wiki

**Trigger:** `/skill:obsidian-wiki-maintain lint`

Run the `wiki_lint` tool to detect structural issues automatically:

```
wiki_lint:0 {"checks": ["broken-links", "orphans", "missing-h1", "filename", "empty-pages", "inbox-orphans"]}
```

The tool returns a report with all findings. Then manually check for:

| Check | How |
|-------|-----|
| **Missing cross-refs** | Pages that mention concepts/entities without `[[linking]]` them. |
| **Contradictions** | Claims on different pages that conflict. Flag with `> ⚠️ Contradicts [[page]]: ...` |
| **Stale claims** | Older pages superseded by newer sources. |

Report findings as a checklist. For each issue, suggest a fix. Ask which to apply, then apply them.

## Conventions

- `[[wiki links]]` for all cross-references
- Filenames: `lowercase-with-dashes`
- Mark contradictions: `> ⚠️ Contradicts [[page]]: description`
