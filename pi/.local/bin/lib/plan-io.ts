import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Plan } from "./types";

export const PLANS_DIR = join(process.cwd(), ".pi", "plans");
export const ARCHIVE_DIR = join(PLANS_DIR, "archive");

/** Expected, user-facing error (bad input, missing plan). Caught at the entry. */
export class PlanError extends Error {}

export function planPath(slug: string): string {
  return join(PLANS_DIR, `${slug}.json`);
}

export function archivedPath(slug: string): string {
  return join(ARCHIVE_DIR, `${slug}.json`);
}

export function readPlan(slug: string): Plan {
  const path = planPath(slug);
  if (!existsSync(path)) {
    if (existsSync(archivedPath(slug))) {
      throw new PlanError(`Plan "${slug}" is archived. Unarchive it first.`);
    }
    throw new PlanError(`Plan "${slug}" not found.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Plan;
}

export function writePlan(plan: Plan): void {
  plan.updated = new Date().toISOString();
  mkdirSync(PLANS_DIR, { recursive: true });
  writeFileSync(planPath(plan.slug), JSON.stringify(plan, null, 2) + "\n");
}

export function listPlanSlugs(): string[] {
  mkdirSync(PLANS_DIR, { recursive: true });
  const slugs: string[] = [];
  for (const f of readdirSync(PLANS_DIR)) {
    if (f.endsWith(".json")) slugs.push(f.replace(/\.json$/, ""));
  }
  return slugs;
}

export function mostRecentPlanSlug(): string | null {
  mkdirSync(PLANS_DIR, { recursive: true });
  const files = readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      let mtime = new Date(0);
      try {
        mtime = statSync(join(PLANS_DIR, f)).mtime;
      } catch {
        // keep epoch fallback for robustness
      }
      return { name: f, mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files.length > 0 ? files[0].name.replace(/\.json$/, "") : null;
}
