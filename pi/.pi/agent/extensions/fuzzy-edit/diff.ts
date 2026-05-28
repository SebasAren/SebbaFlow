/**
 * Diff generation for the fuzzy edit tool.
 * Produces line-numbered diffs matching the built-in edit tool's format.
 */

import * as Diff from "diff";

/**
 * Generate a line-numbered diff matching the built-in edit tool's format.
 * Format: `+N line`, `-N line`, ` N line` where N is zero-padded line number.
 */
export function generateDiff(
  oldContent: string,
  newContent: string,
  path: string = "file",
): { diff: string; firstChangedLine?: number; patch: string } {
  const maxLineNum = Math.max(oldContent.split("\n").length, newContent.split("\n").length);
  const width = String(maxLineNum).length;
  const parts = Diff.diffLines(oldContent, newContent);
  const output: string[] = [];
  let oldLine = 1;
  let newLine = 1;
  let firstChangedLine: number | undefined;
  const contextLines = 4;
  let lastWasChange = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = part.value.split("\n");
    if (raw[raw.length - 1] === "") raw.pop();

    if (part.added || part.removed) {
      if (firstChangedLine === undefined && part.added) {
        firstChangedLine = newLine;
      }
      for (const line of raw) {
        if (part.added) {
          output.push(`+${String(newLine).padStart(width, " ")} ${line}`);
          newLine++;
        } else {
          output.push(`-${String(oldLine).padStart(width, " ")} ${line}`);
          oldLine++;
        }
      }
      lastWasChange = true;
    } else {
      // Context lines — show limited context around changes
      const nextIsChange = i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);
      const hasLeading = lastWasChange;
      const hasTrailing = nextIsChange;

      if (hasLeading && hasTrailing) {
        if (raw.length <= contextLines * 2) {
          for (const line of raw) {
            output.push(` ${String(oldLine).padStart(width, " ")} ${line}`);
            oldLine++;
            newLine++;
          }
        } else {
          const leading = raw.slice(0, contextLines);
          const trailing = raw.slice(raw.length - contextLines);
          for (const line of leading) {
            output.push(` ${String(oldLine).padStart(width, " ")} ${line}`);
            oldLine++;
            newLine++;
          }
          output.push(` ${"".padStart(width, " ")} ...`);
          const skipped = raw.length - leading.length - trailing.length;
          oldLine += skipped;
          newLine += skipped;
          for (const line of trailing) {
            output.push(` ${String(oldLine).padStart(width, " ")} ${line}`);
            oldLine++;
            newLine++;
          }
        }
      } else if (hasLeading) {
        const shown = raw.slice(0, contextLines);
        for (const line of shown) {
          output.push(` ${String(oldLine).padStart(width, " ")} ${line}`);
          oldLine++;
          newLine++;
        }
        const skipped = raw.length - shown.length;
        if (skipped > 0) {
          output.push(` ${"".padStart(width, " ")} ...`);
          oldLine += skipped;
          newLine += skipped;
        }
      } else if (hasTrailing) {
        const skipped = Math.max(0, raw.length - contextLines);
        if (skipped > 0) {
          output.push(` ${"".padStart(width, " ")} ...`);
          oldLine += skipped;
          newLine += skipped;
        }
        for (const line of raw.slice(skipped)) {
          output.push(` ${String(oldLine).padStart(width, " ")} ${line}`);
          oldLine++;
          newLine++;
        }
      } else {
        // No adjacent changes — skip these context lines
        oldLine += raw.length;
        newLine += raw.length;
      }
      lastWasChange = false;
    }
  }

  const patch = Diff.createPatch(path, oldContent, newContent);
  return { diff: output.join("\n"), firstChangedLine, patch };
}
