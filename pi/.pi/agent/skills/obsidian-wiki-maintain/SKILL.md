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
- Topical coverage overview: `~/.local/bin/wiki-search "<topic>"` with key topics to spot-check coverage
- Any obvious issues

## Lint the Wiki

**Trigger:** `/skill:obsidian-wiki-maintain lint`

Run structural checks via the `bash` tool:

```bash
# Broken wiki links: links pointing at pages that don't exist
rg -o --no-filename '\[\[([^]|#]+)' -r '$1' ~/Documents/wiki/wiki/ | sort -u | while read -r p; do
  [ -f "$(find ~/Documents/wiki/wiki -name "$(echo "$p" | tr ' ' '-').md" -print -quit)" ] || echo "MISSING: [[$p]]"
done

# Orphan pages: no other page links to them
# Missing H1 titles
for f in $(find ~/Documents/wiki/wiki -name '*.md'); do
  head -1 "$f" | grep -q '^# ' || echo "NO H1: $f"
done

# Near-empty pages
find ~/Documents/wiki/wiki -name '*.md' -size -200c

# Stale inbox files (older than 2 weeks)
find ~/Documents/wiki/raw/inbox -mtime +14
```

Then manually check for:

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
