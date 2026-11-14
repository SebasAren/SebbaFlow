import { describe, it, expect, afterEach } from "bun:test";
import { FactoryApiError, createFactoryClient } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function recordingFetch(status = 200, body: unknown = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return jsonResponse(body, status);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const PROJECTS = { projects: [{ id: "11111111-1111-1111-1111-111111111111", name: "SebbaFlow" }] };

describe("createFactoryClient", () => {
  afterEach(() => {
    delete process.env.FACTORY_PROJECT_ID;
  });

  it("lists projects with a bearer token header", async () => {
    const { calls, fetchImpl } = recordingFetch(200, PROJECTS);
    const client = createFactoryClient(
      { baseUrl: "http://localhost:4111", token: "tok" },
      fetchImpl,
    );
    const result = await client.listProjects();
    expect(result).toEqual(PROJECTS);
    expect(calls[0].url).toBe("http://localhost:4111/web/factory/projects");
    expect(calls[0].init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer tok",
    });
  });

  it("omits the Authorization header when no token is configured", async () => {
    const { calls, fetchImpl } = recordingFetch(200, PROJECTS);
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    await client.listProjects();
    expect(calls[0].init?.headers).toEqual({ Accept: "application/json" });
  });

  it("strips trailing slashes from the base URL", async () => {
    const { calls, fetchImpl } = recordingFetch(200, PROJECTS);
    const client = createFactoryClient({ baseUrl: "http://localhost:4111/" }, fetchImpl);
    await client.listProjects();
    expect(calls[0].url).toBe("http://localhost:4111/web/factory/projects");
  });

  it("lists work items for a project", async () => {
    const payload = {
      workItems: [{ id: "aaaaaaaa-1111", title: "Fix login" }],
      runningSessionIds: [],
      parkedSessionIds: [],
    };
    const { calls, fetchImpl } = recordingFetch(200, payload);
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    const result = await client.listWorkItems("p1");
    expect(result.workItems).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:4111/web/factory/projects/p1/work-items");
  });

  it("builds attention query params", async () => {
    const { calls, fetchImpl } = recordingFetch(200, { items: [], kinds: {} });
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    await client.listAttention("p1", { view: "unread", kind: "mention" });
    expect(calls[0].url).toBe(
      "http://localhost:4111/web/factory/projects/p1/attention?view=unread&kind=mention",
    );
  });

  it("defaults the attention view to open", async () => {
    const { calls, fetchImpl } = recordingFetch(200, { items: [], kinds: {} });
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    await client.listAttention("p1");
    expect(calls[0].url).toBe("http://localhost:4111/web/factory/projects/p1/attention?view=open");
  });

  it("builds the decision statuses query", async () => {
    const { calls, fetchImpl } = recordingFetch(200, { decisions: [] });
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    await client.listDecisions("p1", "proposed,failed");
    expect(calls[0].url).toBe(
      "http://localhost:4111/web/factory/projects/p1/decisions?statuses=proposed%2Cfailed",
    );
  });

  it("encodes path params when resolving a decision", async () => {
    const { calls, fetchImpl } = recordingFetch(200, { decision: { id: "d1" } });
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    await client.resolveDecision("p1", "d1", "approve");
    expect(calls[0].url).toBe("http://localhost:4111/web/factory/projects/p1/decisions/d1/approve");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe("{}");
  });

  it("throws a configuration hint on 401", async () => {
    const { fetchImpl } = recordingFetch(401, { error: "unauthorized" });
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    const error = await client.listProjects().catch((cause) => cause);
    expect(error).toBeInstanceOf(FactoryApiError);
    expect((error as FactoryApiError).status).toBe(401);
    expect((error as Error).message).toMatch(/FACTORY_TOKEN/);
  });

  it("surfaces the server error detail on other failures", async () => {
    const { fetchImpl } = recordingFetch(500, { error: "boom" });
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    const error = await client.listProjects().catch((cause) => cause);
    expect((error as FactoryApiError).status).toBe(500);
    expect((error as Error).message).toContain("boom");
  });

  it("throws a reachability hint when the server is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
    const error = await client.listProjects().catch((cause) => cause);
    expect((error as Error).message).toMatch(/Cannot reach Factory at http:\/\/localhost:4111/);
  });

  describe("resolveProjectId", () => {
    it("returns an explicit project id without fetching", async () => {
      const { calls, fetchImpl } = recordingFetch();
      const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
      expect(await client.resolveProjectId("p1")).toBe("p1");
      expect(calls).toHaveLength(0);
    });

    it("uses FACTORY_PROJECT_ID from the environment", async () => {
      process.env.FACTORY_PROJECT_ID = "env-id";
      const { calls, fetchImpl } = recordingFetch();
      const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
      expect(await client.resolveProjectId()).toBe("env-id");
      expect(calls).toHaveLength(0);
    });

    it("auto-detects when there is exactly one project", async () => {
      const { fetchImpl } = recordingFetch(200, PROJECTS);
      const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
      expect(await client.resolveProjectId()).toBe("11111111-1111-1111-1111-111111111111");
    });

    it("throws with a project list when there are several", async () => {
      const many = {
        projects: [
          { id: "aaaaaaaa-1111-1111-1111-111111111111", name: "One" },
          { id: "bbbbbbbb-2222-2222-2222-222222222222", name: "Two" },
        ],
      };
      const { fetchImpl } = recordingFetch(200, many);
      const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
      const error = await client.resolveProjectId().catch((cause) => cause);
      expect((error as Error).message).toMatch(/Multiple Factory projects/);
      expect((error as Error).message).toContain("aaaaaaaa");
    });

    it("throws when there are no projects", async () => {
      const { fetchImpl } = recordingFetch(200, { projects: [] });
      const client = createFactoryClient({ baseUrl: "http://localhost:4111" }, fetchImpl);
      const error = await client.resolveProjectId().catch((cause) => cause);
      expect((error as Error).message).toMatch(/No Factory projects found/);
    });
  });
});
