/**
 * TUI renderers shared by all factory tools.
 */

import { type Component, Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

/** Render the tool call line: tool name plus any argument pairs. */
export function renderFactoryToolCall(
  args: Record<string, unknown>,
  theme: Theme,
  context: { lastComponent?: Component },
  toolName: string,
): Text {
  const pairs = Object.entries(args ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  let content = theme.fg("toolTitle", theme.bold(`${toolName} `));
  content +=
    pairs.length > 0 ? theme.fg("accent", pairs.join(" ")) : theme.fg("dim", "(auto project)");
  // Reuse existing component if available to avoid duplicate renders
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the tool result: first summary line collapsed, full text expanded. */
export function renderFactoryToolResult(
  result: { content: Array<{ type: string; text?: string }> },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Querying Factory..."), 0, 0);
  }

  const content = result.content[0];
  const text = content?.type === "text" ? content.text : undefined;
  if (!text) {
    return new Text(theme.fg("error", "Factory API failed"), 0, 0);
  }
  if (state.expanded) {
    return new Text(text, 0, 0);
  }
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  const summary = firstLine.replace(/^#+\s*/, "") || "(empty)";
  return new Text(theme.fg("success", summary), 0, 0);
}
