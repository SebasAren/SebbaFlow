/**
 * Observation store — append-oriented JSONL persistence, one directory per project.
 *
 * Layout (under baseDir, default `~/.config/pi/observational-memory`):
 *   <projectKey>/groups.jsonl    one ObservationGroup per line, append-only
 *   <projectKey>/threads.jsonl   one ThreadRecord per line, append-only, latest-wins per threadId
 *
 * Follows the usage-tracker / store conventions from #140: append-only writes,
 * corrupt lines skipped silently on read, failures logged with the
 * `[observational-memory]` prefix — this module never throws.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GroupKind, ObservationGroup, ThreadRecord } from "./schema";
import { parseGroup, parseThreadRecord } from "./schema";

const LOG_PREFIX = "[observational-memory]";

/** Groups file name inside a project directory. */
const GROUPS_FILE = "groups.jsonl";
/** Thread watermark file name inside a project directory. */
const THREADS_FILE = "threads.jsonl";

export interface GroupQueryOptions {
  /** Only return groups for this thread (pi session id). */
  threadId?: string;
  /** Only return groups of this kind. */
  kind?: GroupKind;
  /** Return at most this many groups (the newest N, in chronological order). */
  limit?: number;
}

function projectPaths(projectDir: string): { groupsPath: string; threadsPath: string } {
  return {
    groupsPath: join(projectDir, GROUPS_FILE),
    threadsPath: join(projectDir, THREADS_FILE),
  };
}

function readLines(path: string): string[] {
  try {
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8");
    return content.length === 0 ? [] : content.split("\n");
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to read ${path}:`, error);
    return [];
  }
}

/**
 * Append an observation group to the project's groups.jsonl.
 * Creates the project directory on first write. Never throws.
 */
export function appendGroup(projectDir: string, group: ObservationGroup): void {
  try {
    mkdirSync(projectDir, { recursive: true });
    appendFileSync(join(projectDir, GROUPS_FILE), `${JSON.stringify(group)}\n`);
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to append group:`, error);
  }
}

/**
 * Read observation groups for a project, oldest first. Corrupt lines are
 * skipped silently. Never throws.
 */
export function getGroups(projectDir: string, options: GroupQueryOptions = {}): ObservationGroup[] {
  const { groupsPath } = projectPaths(projectDir);
  const groups: ObservationGroup[] = [];
  for (const line of readLines(groupsPath)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const group = parseGroup(trimmed);
    if (!group) continue;
    if (options.threadId !== undefined && group.threadId !== options.threadId) continue;
    if (options.kind !== undefined && group.kind !== options.kind) continue;
    groups.push(group);
  }
  if (options.limit !== undefined && groups.length > options.limit) {
    return groups.slice(groups.length - options.limit);
  }
  return groups;
}

/** Look up a single group by its stable id, or undefined. Never throws. */
export function getGroupById(projectDir: string, groupId: string): ObservationGroup | undefined {
  const { groupsPath } = projectPaths(projectDir);
  for (const line of readLines(groupsPath)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const group = parseGroup(trimmed);
    if (group?.id === groupId) return group;
  }
  return undefined;
}

/**
 * Record a thread's observation watermark (lastObservedAt). Appended as a new
 * record; readers treat the last record per threadId as current. Never throws.
 */
export function updateWatermark(projectDir: string, record: ThreadRecord): void {
  try {
    mkdirSync(projectDir, { recursive: true });
    appendFileSync(join(projectDir, THREADS_FILE), `${JSON.stringify(record)}\n`);
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to update watermark:`, error);
  }
}

/**
 * Current ThreadRecord per threadId (last record wins). Corrupt lines are
 * skipped. Order is not guaranteed; keyed access only. Never throws.
 */
export function getThreads(projectDir: string): Record<string, ThreadRecord> {
  const { threadsPath } = projectPaths(projectDir);
  const threads: Record<string, ThreadRecord> = {};
  for (const line of readLines(threadsPath)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const record = parseThreadRecord(trimmed);
    if (!record) continue;
    threads[record.threadId] = record;
  }
  return threads;
}
