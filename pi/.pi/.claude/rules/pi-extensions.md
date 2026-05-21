## Pi extension promptGuidelines

`promptGuidelines` should only contain **non-obvious behavioral guardrails** that the LLM wouldn't infer from the tool's `description` and `promptSnippet`.

- **Do include**: parallel call limits, multi-hop patterns, edit tool edge cases, ordering constraints
- **Do NOT include**: "Use X when you need Y" boilerplate — the `description` field already tells the LLM what the tool does

When adding or reviewing guidelines, ask: "Would the LLM know this from the description alone?" If yes, delete it.
