---
name: store-memory
description: Dump conceptual observations, insights, and patterns to the wiki inbox (~/Documents/wiki/raw/inbox/) as timestamped markdown files. The agent decides autonomously when to store. Use when you discover something worth persisting — an insight, a pattern, a design rationale, or a conceptual observation.
---

# Store Memory to Wiki

Autonomously persist conceptual observations to `~/Documents/wiki/raw/inbox/`. The obsidian-wiki-ingest skill processes inbox into structured wiki later.

## Trigger

**Store autonomously — no permission needed.** Write when you encounter:

- **Insights** — a pattern becomes clear, a design decision makes sense
- **Conceptual observations** — system architecture, trade-offs, rationale
- **Reusable patterns** — approaches that worked across multiple contexts
- **Surprising behavior** — non-obvious system behavior worth remembering

**Do NOT store** (these go to `.claude/rules/`): code gotchas, syntax quirks, import patterns, framework workarounds, error fixes.

**Test:** "Would this help someone understand the system, or avoid a coding mistake?" Former → wiki. Latter → rules.

## Format

```
~/Documents/wiki/raw/inbox/YYYY-MM-DD-descriptive-slug.md
```

```yaml
---
title: "Descriptive Title"
created: 2026-04-25T15:30:00.000Z
tags:
  - agents
  - architecture
---

Free-form markdown content...
```

Double-quote the title to prevent YAML issues with colons.

## CLI

```bash
store-memory --title "My Observation" --tags agents,architecture "The agent observes..."
echo "Content..." | store-memory --title "Title" --tags patterns
```

Fallback: write tool with correct YAML frontmatter.
