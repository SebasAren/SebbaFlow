import type { PhaseName, PhaseStatus, Plan, Step } from "./types";

export function phaseEmoji(status: PhaseStatus): string {
  switch (status) {
    case "not_started":
      return "⬜";
    case "in_progress":
      return "🔄";
    case "done":
      return "✅";
    case "skipped":
      return "⏭️";
  }
}

export function stepIndicator(step: Step): string {
  if (step.completed) return "✅";
  if (
    step.red.status === "in_progress" ||
    step.green.status === "in_progress" ||
    step.refactor.status === "in_progress"
  )
    return "🔄";
  return "⬜";
}

export function deriveStatus(plan: Plan): string {
  const total = plan.steps.length;
  const completedCount = plan.steps.filter((s) => s.completed).length;

  if (completedCount === total) return "All steps complete ✅";

  for (const step of plan.steps) {
    if (step.completed) continue;
    const idx = step.index;
    if (step.red.status === "in_progress")
      return `Step ${idx}/${total} — 🔴 RED`;
    if (step.green.status === "in_progress")
      return `Step ${idx}/${total} — 🟢 GREEN`;
    if (step.refactor.status === "in_progress")
      return `Step ${idx}/${total} — 🔵 REFACTOR`;
    if (step.red.status === "not_started")
      return `Step ${idx}/${total} — Not started`;
    if (step.green.status === "not_started")
      return `Step ${idx}/${total} — 🟢 GREEN pending`;
    if (step.refactor.status === "not_started")
      return `Step ${idx}/${total} — 🔵 REFACTOR pending`;
  }

  return `Step ${completedCount + 1}/${total} — Not started`;
}

export function showPlan(plan: Plan): void {
  const status = deriveStatus(plan);
  const total = plan.steps.length;
  const completedCount = plan.steps.filter((s) => s.completed).length;

  console.log(`# ${plan.title}`);
  console.log(`Slug: ${plan.slug}`);
  console.log(`Status: ${status}`);
  console.log(`Progress: ${completedCount}/${total} steps`);
  console.log(`Created: ${plan.created.split("T")[0]}`);
  console.log("");

  if (plan.context) {
    console.log("## Context");
    console.log(plan.context);
    console.log("");
  }

  if (plan.architecture) {
    console.log("## Architecture");
    console.log(plan.architecture);
    console.log("");
  }

  if (plan.design) {
    console.log("## Design Artifact");
    console.log("");
    console.log("**Current State:**", plan.design.currentState);
    console.log("");
    console.log("**Desired End State:**", plan.design.desiredState);
    console.log("");
    console.log("**Patterns to Follow:**", plan.design.patterns);
    console.log("");
    console.log("**Resolved Decisions:**", plan.design.decisions);
    console.log("");
    console.log("**Open Questions:**", plan.design.questions);
    console.log("");
  }

  console.log("## Steps");
  console.log("");

  for (const step of plan.steps) {
    const indicator = stepIndicator(step);
    const name = step.completed ? `~~${step.name}~~` : step.name;
    console.log(`${indicator} **${step.index}. ${name}**`);

    const r = phaseEmoji(step.red.status);
    const g = phaseEmoji(step.green.status);
    const b = phaseEmoji(step.refactor.status);
    console.log(`   🔴 ${r}  🟢 ${g}  🔵 ${b}`);

    for (const phaseName of ["red", "green", "refactor"] as PhaseName[]) {
      const phase = step[phaseName];
      if (!phase.description) continue;
      const label =
        phaseName === "red"
          ? "🔴 RED"
          : phaseName === "green"
            ? "🟢 GREEN"
            : "🔵 REFACTOR";
      if (phase.status === "in_progress" || phase.status === "not_started") {
        console.log(`   ${label}: ${phase.description}`);
      }
    }
    console.log("");
  }

  if (plan.notes.length > 0) {
    console.log("## Notes");
    for (const note of plan.notes) {
      console.log(`- ${note}`);
    }
    console.log("");
  }

  console.log("## Summary");
  console.log("");
  console.log("| Step | 🔴 RED | 🟢 GREEN | 🔵 REFACTOR |");
  console.log("|------|--------|----------|-------------|");
  for (const step of plan.steps) {
    const r = phaseEmoji(step.red.status);
    const g = phaseEmoji(step.green.status);
    const b = phaseEmoji(step.refactor.status);
    const name = step.completed ? `~~${step.index}~~` : `${step.index}`;
    console.log(`| ${name} | ${r} | ${g} | ${b} |`);
  }
  console.log("");
}
