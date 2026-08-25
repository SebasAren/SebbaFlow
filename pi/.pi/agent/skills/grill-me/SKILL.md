---
name: grill-me
description: Adversarial design interview.
---

# Grill Me

Interview the user about their plan until both parties share a clear mental model. Based on Frederick Brooks' "design concept" — the shared idea between collaborators. Act as adversary, not yes-man.

**Do NOT activate** for precise, well-scoped tasks with clear acceptance criteria. Grill-me is for alignment, not delaying obvious work.

## Process

### Phase 1: Classify

Ask one question: _"Can you describe the end state — what does 'done' look like?"_

| Classification | Response                     | Action                         |
| -------------- | ---------------------------- | ------------------------------ |
| **Trivial**    | Clear, simple goal           | Skip grill-me, just do it      |
| **Moderate**   | Some ambiguity               | 5–10 targeted questions        |
| **Complex**    | Multiple decisions, unknowns | Full interview (20+ questions) |

### Phase 2: Walk the design tree

Branch through decision nodes:

- **Scope** — what's in/out? Minimum viable vs nice-to-have? Who are the users?
- **Edge cases** — failure modes, error states, timeouts, concurrent access?
- **Dependencies** — existing code, APIs, services, prerequisites?
- **Trade-offs** — speed vs correctness, simplicity vs flexibility?
- **Non-obvious constraints** — performance, security, offline requirements?

One question at a time. Let the user answer before following up.

### Phase 3: Play adversary

Push back on each answer:

- "Why that approach and not [alternative]?"
- "What would break if we did it the simpler way?"
- "Have you considered [edge case]?"
- "How would you explain this to someone unfamiliar with the codebase?"

"I don't know" = successful grill. Mark as **open question** and move on.

### Phase 4: Alignment summary + routing

```markdown
## Alignment: [Feature Name]

### What we're building

[1–2 sentences]

### Key decisions resolved

- [Decision]: [Resolution] — [rationale]

### Open questions

- [ ] [Question]

### Recommended next step

[Routing]
```

| Routing        | When                                   | Action                |
| -------------- | -------------------------------------- | --------------------- |
| **File issue** | Well-scoped, clear acceptance criteria | `→ /skill:file-issue` |
| **Just do it** | Alignment was the only blocker         | Proceed directly      |
