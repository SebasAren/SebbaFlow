export type PhaseStatus = "not_started" | "in_progress" | "done" | "skipped";
export type PhaseName = "red" | "green" | "refactor";

export interface Phase {
  description: string;
  status: PhaseStatus;
}

export interface Step {
  index: number;
  name: string;
  red: Phase;
  green: Phase;
  refactor: Phase;
  completed: boolean;
}

export interface DesignArtifact {
  currentState: string;
  desiredState: string;
  patterns: string;
  decisions: string;
  questions: string;
}

export interface Plan {
  title: string;
  slug: string;
  context: string;
  architecture: string;
  design?: DesignArtifact;
  created: string;
  updated: string;
  steps: Step[];
  notes: string[];
}

export interface StepInput {
  name: string;
  red: string;
  green: string;
  refactor?: string;
}
