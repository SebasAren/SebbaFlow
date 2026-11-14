/**
 * HTTP client for the Mastra Factory REST API (`/web/factory/...`).
 *
 * The token is a bearer JWT from the Factory auth provider (WorkOS-issued);
 * auth-disabled self-hosted factories work without one.
 */

import type { FactoryConfig } from "./config";

export class FactoryApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FactoryApiError";
  }
}

// ── Wire shapes (defensive — the API may carry extra fields) ───────────────

export interface FactoryProject {
  id: string;
  name?: string;
}

export interface WorkItemSession {
  sessionId?: string;
}

export interface WorkItem {
  id: string;
  title?: string;
  stages?: string[];
  board?: string | null;
  sessions?: Record<string, WorkItemSession>;
}

export interface WorkItemsPayload {
  workItems: WorkItem[];
  runningSessionIds?: string[];
  parkedSessionIds?: string[];
}

export interface AttentionItem {
  id?: string;
  kind?: string;
  title?: string;
  key?: string;
  unread?: boolean;
}

export interface AttentionPayload {
  items: AttentionItem[];
  kinds?: Record<string, { open?: number; unread?: number }>;
}

export interface Decision {
  id: string;
  workItemId?: string;
  type?: string;
  status?: string;
  role?: string;
  lastError?: string | null;
}

export interface DecisionsPayload {
  decisions: Decision[];
}

export interface DecisionResultPayload {
  decision: Decision;
}

export interface AttentionQuery {
  view?: "open" | "unread" | "archived";
  kind?: string;
}

export type ResolveAction = "approve" | "dismiss" | "retry";

export interface FactoryClient {
  listProjects: () => Promise<{ projects: FactoryProject[] }>;
  listWorkItems: (projectId: string) => Promise<WorkItemsPayload>;
  listAttention: (projectId: string, query?: AttentionQuery) => Promise<AttentionPayload>;
  listDecisions: (projectId: string, statuses?: string) => Promise<DecisionsPayload>;
  resolveDecision: (
    projectId: string,
    decisionId: string,
    action: ResolveAction,
  ) => Promise<DecisionResultPayload>;
  resolveProjectId: (explicit?: string) => Promise<string>;
}

// ── Client ─────────────────────────────────────────────────────────────────

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function createFactoryClient(
  config: FactoryConfig,
  fetchImpl: typeof fetch = fetch,
): FactoryClient {
  const base = config.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      const reqHeaders: Record<string, string> = { ...headers };
      if (init?.body) reqHeaders["Content-Type"] = "application/json";
      res = await fetchImpl(`${base}${path}`, { ...init, headers: reqHeaders });
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new FactoryApiError(
        0,
        `Cannot reach Factory at ${base} — is the server running? (${cause})`,
      );
    }
    if (res.status === 401) {
      throw new FactoryApiError(
        401,
        'Factory rejected the request (401 unauthorized). Set FACTORY_TOKEN or add a "factory" entry with a key to ~/.pi/agent/auth.json.',
      );
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string } | null;
        if (body?.error) detail += `: ${body.error}`;
      } catch {
        // body was not JSON — keep the status-only detail
      }
      throw new FactoryApiError(res.status, `Factory request failed (${detail})`);
    }
    return (await res.json()) as T;
  }

  function listProjects(): Promise<{ projects: FactoryProject[] }> {
    return request<{ projects: FactoryProject[] }>("/web/factory/projects");
  }

  async function resolveProjectId(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    const envId = process.env.FACTORY_PROJECT_ID;
    if (envId) return envId;
    const { projects } = await listProjects();
    if (projects.length === 1) return projects[0].id;
    if (projects.length === 0) {
      throw new FactoryApiError(
        404,
        "No Factory projects found. Create one in the Factory UI (Work → Intake) first.",
      );
    }
    const lines = projects.map((p) => `- ${p.name ?? "(unnamed)"}: ${p.id}`).join("\n");
    throw new FactoryApiError(
      400,
      `Multiple Factory projects found. Pass projectId explicitly or set FACTORY_PROJECT_ID:\n${lines}`,
    );
  }

  return {
    listProjects,
    listWorkItems: (projectId) =>
      request<WorkItemsPayload>(
        `/web/factory/projects/${encodeURIComponent(projectId)}/work-items`,
      ),
    listAttention: (projectId, query = {}) =>
      request<AttentionPayload>(
        withQuery(`/web/factory/projects/${encodeURIComponent(projectId)}/attention`, {
          view: query.view ?? "open",
          kind: query.kind,
        }),
      ),
    listDecisions: (projectId, statuses = "proposed") =>
      request<DecisionsPayload>(
        withQuery(`/web/factory/projects/${encodeURIComponent(projectId)}/decisions`, { statuses }),
      ),
    resolveDecision: (projectId, decisionId, action) =>
      request<DecisionResultPayload>(
        `/web/factory/projects/${encodeURIComponent(projectId)}/decisions/${encodeURIComponent(decisionId)}/${action}`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    resolveProjectId,
  };
}
