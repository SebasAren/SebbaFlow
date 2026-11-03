/**
 * Observational memory extension for Pi.
 *
 * Passively records compact observations (user requests, assistant
 * conclusions, files touched, errors) to ~/.config/pi/observations.jsonl,
 * injects a digest of past observations into the system prompt for
 * continuity across sessions, and shows recent observations via /memory.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  InputEvent,
  SessionStartEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { assistantObservation, userObservation } from "./observe";
import { appendObservation, readObservations } from "./store";
import { buildMemoryReport, buildMemorySection } from "./digest";

/** Default path for the observations JSONL file. */
const DEFAULT_OBSERVATIONS_PATH = join(homedir(), ".config", "pi", "observations.jsonl");

/** System-prompt section key pi wraps in <observational-memory> tags. */
const SECTION_KEY = "observational-memory";

const DIGEST_ENTRY_LIMIT = 40;
const REPORT_ENTRY_LIMIT = 20;

interface ExtensionDeps {
  appendObservation: typeof appendObservation;
  readObservations: typeof readObservations;
  observationsPath: string;
}

/** The slice of ExtensionContext the handlers rely on. */
interface HandlerContext {
  cwd?: string;
  sessionManager?: { getSessionId?: () => string | undefined };
}

/**
 * Create the observational memory extension with injectable dependencies.
 */
export function createExtension(deps: ExtensionDeps) {
  return function observationalMemory(pi: ExtensionAPI): void {
    // Digest of past observations, computed once per session_start and
    // re-applied on every before_agent_start so it survives compaction.
    let memorySection: string | null = null;

    function observeContext(ctx: HandlerContext): { cwd: string; sessionId: string } {
      return {
        cwd: ctx.cwd ?? process.cwd(),
        sessionId: ctx.sessionManager?.getSessionId?.() ?? "unknown",
      };
    }

    // Build the digest at session start, excluding the live session's own
    // observations so a reloaded/resumed session doesn't recall itself.
    pi.on("session_start", (_event: SessionStartEvent, ctx) => {
      const { cwd, sessionId } = observeContext(ctx);
      memorySection = buildMemorySection(
        deps.readObservations(deps.observationsPath, {
          cwd,
          excludeSessionId: sessionId,
          limit: DIGEST_ENTRY_LIMIT,
        }),
      );
    });

    // Inject the digest as a system-prompt section (no transcript pollution;
    // pi diffs sections so repeated identical sets are a no-op).
    pi.on("before_agent_start", (event: BeforeAgentStartEvent) => {
      if (memorySection === null) return;
      event.systemPromptOptions.sections = {
        ...event.systemPromptOptions.sections,
        [SECTION_KEY]: memorySection,
      };
    });

    // Record user prompts. Slash commands and extension-sourced steering are
    // UI machinery, not requests worth remembering.
    pi.on("input", (event: InputEvent, ctx) => {
      if (event.source === "extension") return;
      const entry = userObservation(event.text, observeContext(ctx));
      if (entry) deps.appendObservation(entry, deps.observationsPath);
    });

    // Record assistant turn outcomes (text gists, files touched, errors).
    pi.on("turn_end", (event: TurnEndEvent, ctx) => {
      if (event.message.role !== "assistant") return;
      const entry = assistantObservation(
        event.message,
        event.toolResults ?? [],
        observeContext(ctx),
      );
      if (entry) deps.appendObservation(entry, deps.observationsPath);
    });

    // Register /memory command
    pi.registerCommand("memory", {
      description: "Show recent observations recorded for this project",
      handler: async (_args, ctx) => {
        const { cwd } = observeContext(ctx);
        const entries = deps.readObservations(deps.observationsPath, {
          cwd,
          limit: REPORT_ENTRY_LIMIT,
        });
        ctx.ui.setWidget("memory-report", buildMemoryReport(entries, cwd));
      },
    });
  };
}

/**
 * Default export with real dependencies wired in.
 */
export default function observationalMemory(pi: ExtensionAPI): void {
  createExtension({
    appendObservation,
    readObservations,
    observationsPath: DEFAULT_OBSERVATIONS_PATH,
  })(pi);
}
