# Observational Memory — Design Spec

**Status:** Proposed. This document maps [Mastra Observational Memory](https://mastra.ai) onto the pi
extension API and records the design decisions that gate implementation. It is the anchor for the
observational-memory epic ([#141](https://github.com/SebasAren/SebbaFlow/issues/141)); the decisions
below are binding for the sibling issues unless an implementer finds contrary evidence, in which case
this spec is updated first.

| Epic issue                                                | Deliverable                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [#142](https://github.com/SebasAren/SebbaFlow/issues/142) | This design spec                                                             |
| [#143](https://github.com/SebasAren/SebbaFlow/issues/143) | Observation store — schema, persistence, project identity                    |
| [#144](https://github.com/SebasAren/SebbaFlow/issues/144) | Observer — background compression into observation groups                    |
| [#145](https://github.com/SebasAren/SebbaFlow/issues/145) | Reflector — condense the observation log into reflections                    |
| [#146](https://github.com/SebasAren/SebbaFlow/issues/146) | Context lifecycle — replace observed messages with an `<observations>` block |
| [#147](https://github.com/SebasAren/SebbaFlow/issues/147) | Recall tool — retrieval mode with source ranges                              |
| [#148](https://github.com/SebasAren/SebbaFlow/issues/148) | UX & config — `/memory` viewer, status, observer/reflector model config      |
| [#149](https://github.com/SebasAren/SebbaFlow/issues/149) | Supersede heuristic v1 from PR #140                                          |

Suggested build order: #143 → #144 → #146 (first end-to-end cycle) → #145 → #147 → #148 → #149.

## What Observational Memory is

Observational Memory (OM) is **context replacement, not summarization-on-top**. A background
**Observer** model continuously compresses raw conversation history into structured _observation
groups_ — event-based records of decisions, errors, user statements, and files touched — rather than
per-turn gists. A **Reflector** condenses a growing observation log into lossy _reflections_ once it
exceeds its own budget, keeping recent observations detailed. Observed messages are then **removed
from the context window** and replaced by a single `<observations>` block. Raw history oscillates
around a bounded band instead of growing unbounded; prompt caches stay warm because the observation
log changes only at its tail. Mastra reports 3–6× text compression (5–40× on tool-heavy work) and
4–10× cost savings from cache-friendly rewriting.

The prior art is `integrations/opencode` in `mastra-ai/mastra` (OM in a coding-agent host) and
`packages/memory/src/processors/observational-memory/` (the processor itself). All Mastra numbers
cited below were confirmed from that source.

## Concept mapping (Mastra → pi)

| Mastra concept                                        | pi mechanism                                                                                                   | Implementing issue |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| Context replacement with `<observations>` block       | `context` event handler mutating `messages` (pi restores prompt/tool state after the handler)                  | #146               |
| `messageTokens` / `observationTokens` thresholds      | `ctx.getContextUsage()` + token count of unobserved session entries                                            | #143, #148         |
| Thread                                                | pi session — `ctx.sessionManager.getSessionId()`                                                               | #143               |
| Resource (cross-thread memory scope)                  | Worktree-aware project key (origin URL → git common dir → cwd), cached per session                             | #143               |
| Raw message store                                     | pi session JSONL — `sessionManager.getEntries()`, parsing prior art `session-memory` `parseSessionFile(lines)` | #147               |
| Observation source ranges (`startId:endId`)           | pi session entry ids — `SessionEntryBase { type, id, parentId, timestamp }`                                    | #143, #147         |
| Observer / Reflector model calls                      | `runSubagent` from `@pi-ext/shared` with a `noExtensions: true` session factory                                | #144, #145         |
| Async buffering (`bufferTokens`)                      | Extension-side buffer counted on each `context` event; async observation scheduled on `agent_end`              | #144               |
| Idle activation (`bufferOnIdle`, `activateAfterIdle`) | Extension-level timer armed on `agent_end` / `ctx.isIdle()` (no SDK primitive exists)                          | #144               |
| Run cancellation                                      | `session_before_switch` (cancellable) and `session_shutdown` abort in-flight subagent runs                     | #144, #145         |
| Toasts / studio progress                              | `ctx.ui.notify()` (`info` \| `warning` \| `error` only) + status surface                                       | #148               |
| LibSQL persistent storage (opencode plugin)           | Per-project file store under `~/.config/pi/observational-memory/<project-key>/`                                | #143               |
| Config file (`.opencode/mastra.json`)                 | pi settings surface / project `.pi/` config                                                                    | #148               |
| Recall tool (browse raw history behind ranges)        | Session JSONL paging by entry-id ranges, with detail levels and pagination                                     | #147               |

## Design decisions

### 1. Thresholds and buffering policy

**Decision.** Adopt Mastra's defaults as fixed constants for v1:

| Knob                | Default                       | Meaning                                                       |
| ------------------- | ----------------------------- | ------------------------------------------------------------- |
| `messageTokens`     | 30 000                        | Unobserved raw-message tokens that trigger an observation run |
| `observationTokens` | 40 000                        | Observation-log size that triggers the Reflector              |
| `bufferTokens`      | 0.2 × `messageTokens` (6 000) | Async background buffering cadence                            |
| `bufferActivation`  | 0.8                           | Retain ~20% of `messageTokens` as raw messages                |
| `blockAfter`        | 1.2 × threshold               | Past this, a synchronous observation is allowed               |

Thresholds accept a single number or a `{min, max}` range, as in Mastra: the `min` end is used when
the observation log is nearly full (compress harder), the `max` end when it has room (stay detailed).

**Evidence.** Mastra's processor defaults are exactly these values
(`packages/memory/src/processors/observational-memory/types.ts`); pi exposes
`ctx.getContextUsage(): ContextUsage | undefined` (`core/agent-session.d.ts`) for context-window
accounting, so a fixed policy is implementable and a model-aware one is possible later.

**Alternatives rejected.** Deriving thresholds from the live model context window in v1: the
`ContextUsage` shape and cross-model behavior would need verification per provider; fixed constants
are predictable and match the reference implementation. Per-model scaling is a #148 config concern.

**Consequences.** #143/#144 implement the counting; #148 exposes overrides. The counting point is
each `context` event (pi fires one per LLM call, which is Mastra's step time) over entries newer
than the observation watermark.

### 2. Context injection via the `context` event

**Decision.** OM replaces observed messages by mutating `messages` inside a **`context` event
handler** — the same handler counts the buffer (Decision 1) and injects the `<observations>` block
in place of the observed span.

**Evidence.** The pi SDK provides two mutation points before each LLM call
(`core/extensions/types.d.ts`):

- `context`: `messages` holds the conversation **without** system messages; the handler may modify
  them; pi **restores prompt and tool state after the handler returns**. This is exactly OM's
  replace-the-conversation semantic with the host keeping ownership of everything else.
- `context_with_system`: fires after all `context` handlers restored prompt/tool state, with the
  full transcript, and **the result is sent as returned** — the handler owns the system prompt and
  tool declarations.

`before_agent_start` exposes a readonly `systemPrompt` and mutable options only — it is additive and
structurally cannot replace messages.

**Alternatives rejected.** `context_with_system` would force OM to take ownership of prompt and tool
declarations on every call — a large, unnecessary blast radius that violates the turn-safety
contract (Decision 5). `before_agent_start` can only add sections; it cannot remove observed
history.

**Consequences.** #146 implements the handler. Because pi re-fires `context` before every LLM call,
OM rebuilds the context view on each call from the current watermark — no cached message arrays
across calls (see [Interplay with pi compaction](#interplay-with-pi-compaction)).

### 3. Source ranges from session entry ids

**Decision.** Every observation group stores `sourceRange: { startId, endId }` where both values
are **pi session entry ids**. The recall surface (#147) resolves a range by locating `startId` and
`endId` in the session JSONL and paging the entries between them.

**Evidence.** Session entries carry a stable identity: `SessionEntryBase { type, id, parentId,
timestamp }` (`core/session-manager.d.ts`), and `sessionManager.getEntries(): SessionEntry[]`
returns the entries of the current leaf path. The parsing prior art is `session-memory`'s
`parseSessionFile(lines: string[]): SessionEntry[]` (corrupt lines skipped, never throws).

**Alternatives rejected.** Turn indices (`startTurn:endTurn`): unstable across compaction and
forks. Timestamps: ambiguous under clock skew and can't address a single entry. Entry ids give
Mastra-grade precision (`recall` can offer detail levels, pagination, and part indexing behind a
range) with zero new storage.

**Consequences.** #143 persists ranges verbatim; #147 implements browsing. Ranges are defined on the
leaf path; entries outside it are ignored when resolving. After compaction removes entries, ranges
resolve to whatever survives (see compaction section below).

### 4. Background run lifecycle

**Decision.** No SDK idle primitive exists in pi, so OM owns its own lifecycle:

- **Buffer counting** happens on every `context` event (Decision 1) — count-only, no mutation,
  unless tokens ≥ `blockAfter`, where a synchronous observation is permitted (Mastra's
  `blockAfter` semantic).
- **Async observation** (Observer, later Reflector) is scheduled when the buffer crosses
  `bufferTokens` and **runs after `agent_end`** via `runSubagent`, so no model latency is ever added
  to a live turn.
- **Idle activation** (Mastra `bufferOnIdle` + `activateAfterIdle`) is an extension-level timer
  armed on `agent_end` (proposed default: 5 minutes) and cancelled on `agent_start`,
  `session_before_switch`, and `session_shutdown`.
- **Cancellation:** `session_before_switch` (cancellable event, `reason: "new" | "resume"`) and
  `session_shutdown` (`reason: "quit" | "reload" | "new" | "resume" | "fork"`) abort in-flight
  subagent runs via `AbortSignal`. Partial results are discarded — observation groups are written
  atomically.
- **Persistence:** the watermark and pending-buffer state live in the #143 store keyed by
  (project, session). On resume or reload, OM rebuilds from the store and the session JSONL; no
  in-memory state is authoritative.

**Evidence.** `ctx.isIdle()` (`core/extensions/types.d.ts`) reports whether the agent is streaming;
`agent_start`/`agent_end` bracket each turn; `runSubagent` accepts `timeoutMs`, `signal`,
`maxRetries`, `fallbackModel`, and `createSession` — the factory must create sessions with
`noExtensions: true` (extension rulebook) so Observer/Reflector calls cannot recurse into OM or any
other extension.

**Alternatives rejected.** Waiting for an SDK idle hook: none exists (`activateAfterIdle` was
verified absent from pi-coding-agent's API surface). Observing mid-turn on `context` events
unconditionally: would inject model latency into live turns below `blockAfter`.

**Consequences.** #144 implements the scheduler and timers; #145 reuses the same lifecycle for
reflection runs.

### 5. Failure policy — OM never breaks the turn

**Decision.** OM is strictly fail-open:

1. No OM handler ever throws across the extension API boundary; every entry point catches,
   logs with an `[observational-memory]` prefix, and continues.
2. If the `context` handler fails, it returns the messages **unmodified** — the turn proceeds with
   full raw history, exactly as if OM were disabled.
3. Observer/Reflector failures go through `runSubagent`'s retry chain (same-model retry with
   backoff → fallback model → give up); a give-up is silently deferred to the next scheduling
   opportunity.
4. Store failures are logged and skipped; reads tolerate corrupt lines (the `parseSessionFile`
   convention).
5. User-visible degradation is at most one `ctx.ui.notify("warning")` per turn — OM never
   blocks or terminates a session, and `notify` has no success level, so success is expressed only
   through the #148 status surface.

**Evidence.** This matches both the extension rulebook (tool errors must be thrown deliberately,
never leaked as crashes; subagent output handling is already abstracted by `runSubagent`) and
PR #140's established store conventions (errors caught and logged, corrupt JSONL lines skipped).

**Alternatives rejected.** Hard-failing on store corruption (would violate 1) or blocking a turn to
finish an observation (would violate the latency guarantee below).

**Consequences.** Every implementing issue (#143–#148) tests at least one injected-failure path.

## Turn-safety contract

Normative summary; every epic issue inherits it:

- OM adds **zero model latency to a live turn** below `blockAfter`; all model work is asynchronous
  after `agent_end`.
- OM **never throws** across the extension API boundary; worst case is a logged warning.
- On any failure the user sees **at most one warning toast per turn**; the conversation continues
  unmodified.
- Session switches, forks, resumes, and shutdowns **cancel all in-flight OM work** within the
  cancellation events; nothing keeps running against a dead session.
- OM **never drops messages irreversibly**: replacement is a view built per LLM call from the
  watermark; the raw session JSONL is never modified.

## Interplay with pi compaction

pi can compact history (`session_before_compact` with `reason: "manual" | "threshold" |
"overflow"`). OM must tolerate compaction trimming entries its watermark or ranges reference:

- The **unobserved set is recomputed from the live transcript on every `context` call** — never
  cached across calls.
- A watermark pointing at removed entries is **clamped forward** to the first surviving entry.
- Recall ranges resolving to removed entries return whatever survives, with an explicit truncation
  marker rather than an error.
- On `reason: "overflow"`, OM treats compaction as a signal to flush buffered observations first on
  the next scheduling point (the Mastra equivalent is overflow retry with a smaller context).

## Supersession of PR #140

PR #140 (heuristic v1) is superseded by this epic and stays open until #149. What carries over:
extension layout conventions, test patterns, and the corruption-tolerant JSONL approach. What is
replaced: per-turn heuristic gists (→ Observer, #144), the additive system-prompt digest (→
`context`-event replacement, #146), and the flat per-cwd `~/.config/pi/observations.jsonl` store
(→ project-keyed store, #143). **No data migration** — the old file is abandoned in place.

## Non-goals

- **No Obsidian/wiki integration.** pi has no wiki surface by design; the wiki pipeline lives in the
  `obsidian/` stow package.
- **No vector/semantic recall search** in the initial epic. Browsing behind source ranges covers
  recall; embedding-backed search is optional future work and would be a separate issue.
- **No migration** of PR #140's per-cwd observation data.
- **No cross-project memory.** Memory scope is per project (resource = project key) and per session
  (thread); reflections are never shared across projects.
- **No mid-turn context rewriting** below `blockAfter` — OM never mutates context while a turn is
  streaming except for the counting read.

## Open questions

Where pi cannot match Mastra 1:1, the gap and current answer:

1. **No step-time abort semantics.** Mastra can re-enter observation synchronously at its block
   threshold between steps; pi's `context` handler can do the same in principle, but v1 only allows
   it at ≥ `blockAfter` (Decision 4). If real-world buffer overshoot proves problematic, revisit.
2. **Idle activation is an extension timer.** Correctness depends on `agent_end` firing reliably;
   if pi adds a native idle hook later, migrate to it.
3. **`notify` lacks a success level.** OM communicates healthy progress only via the #148 status
   surface; there is no toast equivalent for "observation complete".
4. **`auto` model resolution for Observer/Reflector.** Proposal: cheap/fast model via `@pi-ext/shared`
   model conventions (`getModel`/`CHEAP_MODEL`), preferring a low-cost sibling of the active
   provider — final policy is a #148 config decision.
5. **Token counting method.** Which tokenizer approximates provider counts best is an implementation
   detail for #143/#144; the spec fixes only the counting point (`context` events) and thresholds.

## References

- Mastra OM processor: `mastra-ai/mastra` → `packages/memory/src/processors/observational-memory/`
  (types, defaults), `integrations/opencode/` (host integration prior art)
- pi SDK: `pi-coding-agent` `dist/core/extensions/types.d.ts` (events), `dist/core/session-manager.d.ts`
  (entries), `dist/core/agent-session.d.ts` (`getContextUsage`); extension rulebook
  `.claude/rules/pi-extensions.md`
- In-repo prior art: `pi/.pi/agent/extensions/session-memory/` (session JSONL parsing),
  `pi/.pi/agent/extensions/shared/src/subagent.ts` (`runSubagent`)
