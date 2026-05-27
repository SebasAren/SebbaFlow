---
name: obsidian-wiki-ingest
description: Ingest sources into the wiki.
---

# Ingest Sources into the Wiki

Process sources into the persistent wiki at `~/Documents/wiki/`.

## Vault Layout

```
~/Documents/wiki/
├── raw/                   # Immutable source documents (user-placed, never modified by LLM)
│   ├── inbox/             # Staging — drop files/URLs here
│   ├── articles/          # Web articles, blog posts
│   ├── notes/             # Markdown, text files
│   ├── papers/            # PDFs
│   ├── videos/            # Video files
├── wiki/                  # LLM-maintained knowledge base
│   ├── concepts/          # Concept & topic pages
│   ├── entities/          # People, places, things
│   ├── sources/           # Source summaries
│   ├── synthesis/         # High-level overviews
│   └── analysis/          # Answers, comparisons, explorations
└── SCHEMA.md
```

## Source Skepticism

| Tier | Examples | Stance |
|------|----------|--------|
| **High** | Peer-reviewed papers, official docs | Trust unless contradicted |
| **Medium** | Known-author blogs, conference talks | Verify surprising claims |
| **Low** | Reddit/HN/forum posts, anonymous sources | **Demand evidence** |

Flag unbacked strong claims: `> ⚠️ **Unverified claim** from [source-type]: description — no evidence provided.`

Separate observation from interpretation. Check for confounding factors. Never silently drop claims.

## Inbox Ingest Flow

**Trigger:** `/skill:obsidian-wiki-ingest` (processes `raw/inbox/`) or `/skill:obsidian-wiki-ingest <path-or-url>`.

1. **Detect and classify** inbox contents → move to appropriate `raw/` subdirectory
2. **Duplicate check** — `wiki_search` for existing coverage, check `wiki/sources/<slug>.md`
3. **Read the source** — `read` for files, `web_fetch` for URLs, `yt-dlp` for YouTube transcripts
4. **Evaluate credibility** — apply source skepticism tiers
5. **Discuss takeaways** — surface flagged claims for user review
6. **Create/update pages** — source summary, entities, concepts, synthesis
7. **Empty inbox** when done

### YouTube transcript extraction

```bash
TMPDIR=$(mktemp -d)
yt-dlp --write-auto-sub --sub-format vtt --convert-subs srt --skip-download \
  --output "$TMPDIR/{id}.%(ext)s" {url}
sed '/^[0-9]/d; /^$/d; /-->/d' "$TMPDIR/{id}.en.srt" \
  | sed 's/<[^>]*>//g' | uniq > "$TMPDIR/{slug}.md"
# ... process, then:
rm -rf "$TMPDIR"
```

## Page Conventions

- `[[wiki links]]` for all cross-references
- Filenames: `lowercase-with-dashes`
- Each page: title (H1), summary line, content, related links
- Mark contradictions: `> ⚠️ Contradicts [[page]]: description`
