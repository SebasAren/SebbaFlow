import { existsSync, readFileSync } from "node:fs";
import { PlanError } from "./plan-io";
import type { StepInput } from "./types";

/**
 * Parse the agent-friendly text step format:
 *
 *   STEP 1: Step name
 *   RED: Description
 *   GREEN: Description
 *   REFACTOR: Description (optional)
 *   ---
 *   STEP 2: Next step...
 */
export function parseStepsFromText(text: string): StepInput[] {
  const steps: StepInput[] = [];
  let currentStep: Partial<StepInput> | null = null;

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const stepMatch = line.match(/^STEP\s+(\d+)\s*:\s*(.+)$/i);
    if (stepMatch) {
      if (currentStep) {
        if (!currentStep.name || !currentStep.red || !currentStep.green) {
          throw new PlanError(
            "Error: Step missing required fields (name, red, green)",
          );
        }
        steps.push(currentStep as StepInput);
      }
      currentStep = { name: stepMatch[2] };
      continue;
    }

    const phaseMatch = line.match(/^(RED|GREEN|REFACTOR)\s*:\s*(.*)$/i);
    if (phaseMatch) {
      if (!currentStep) {
        throw new PlanError(
          `Error: Phase "${phaseMatch[1]}" outside of a step`,
        );
      }
      const key = phaseMatch[1].toLowerCase() as "red" | "green" | "refactor";
      (currentStep as Record<string, string>)[key] = phaseMatch[2];
      continue;
    }

    if (line === "---") continue;
    if (line.startsWith("#")) continue;
  }

  if (currentStep) {
    if (!currentStep.name || !currentStep.red || !currentStep.green) {
      throw new PlanError(
        "Error: Step missing required fields (name, red, green)",
      );
    }
    steps.push(currentStep as StepInput);
  }

  if (steps.length === 0) {
    throw new PlanError("Error: No steps found in input");
  }

  return steps;
}

/** Parse steps from JSON array, falling back to the text format. */
export function parseStepsInput(content: string): StepInput[] {
  const trimmed = content.trim();

  if (trimmed.startsWith("[")) {
    try {
      const steps = JSON.parse(trimmed) as StepInput[];
      if (Array.isArray(steps) && steps.length > 0) {
        return steps;
      }
    } catch {
      // Not valid JSON, fall through to text format
    }
  }

  return parseStepsFromText(trimmed);
}

/** Read steps from --steps-file (preferred) or --steps (inline). */
export function readStepsFromSource(
  flags: Record<string, string>,
): StepInput[] {
  if (flags["steps-file"]) {
    const filePath = flags["steps-file"];
    if (!existsSync(filePath)) {
      throw new PlanError(`Error: Steps file not found: ${filePath}`);
    }
    const content = readFileSync(filePath, "utf8");
    return parseStepsInput(content);
  }

  if (flags.steps) {
    return parseStepsInput(flags.steps);
  }

  throw new PlanError("Error: Either --steps or --steps-file is required");
}
