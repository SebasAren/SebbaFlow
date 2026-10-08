/**
 * task-grade tests — grading logic, key resolution, and API wiring.
 *
 * The OpenRouter classify call is exercised through an injected fetch
 * implementation; no network access. auth.json handling uses temp files.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_CLASSIFIER,
  DEFAULT_FLASH_MODEL,
  DEFAULT_PRO_MODEL,
  buildQuestion,
  gradeTask,
  pickGrade,
  resolveApiKey,
} from "./task-grade";

describe("buildQuestion", () => {
  test("is a static choice question over flash/pro criteria", () => {
    const q = buildQuestion();
    expect(q.type).toBe("choice");
    expect(Object.keys(q.criteria).sort()).toEqual(["flash", "pro"]);
  });
});

describe("pickGrade", () => {
  test("routes by pro probability with the safe threshold", () => {
    expect(
      pickGrade({
        type: "choice",
        choice: "pro",
        probabilities: { flash: 0.2, pro: 0.77 },
      }),
    ).toEqual({ grade: "pro", probability: 0.77 });
    expect(
      pickGrade({
        type: "choice",
        choice: "flash",
        probabilities: { flash: 0.39, pro: 0.61 },
      }),
    ).toEqual({ grade: "pro", probability: 0.61 });
    expect(
      pickGrade({
        type: "choice",
        choice: "flash",
        probabilities: { flash: 1, pro: 0 },
      }),
    ).toEqual({ grade: "flash", probability: 0 });
    expect(
      pickGrade({
        type: "choice",
        choice: "flash",
        probabilities: { flash: 0.51, pro: 0.49 },
      }),
    ).toEqual({ grade: "flash", probability: 0.49 });
  });

  test("falls back to the choice label when probabilities are missing", () => {
    expect(pickGrade({ type: "choice", choice: "pro" })).toEqual({
      grade: "pro",
      probability: 1,
    });
    expect(pickGrade({ type: "choice", choice: "flash" })).toEqual({
      grade: "flash",
      probability: 0,
    });
  });

  test("rejects unusable answers", () => {
    expect(pickGrade(undefined)).toBeUndefined();
    expect(pickGrade({})).toBeUndefined();
    expect(pickGrade({ type: "choice", choice: "bogus" })).toBeUndefined();
    expect(pickGrade({ type: "score", score: 1 })).toBeUndefined();
  });
});

describe("resolveApiKey", () => {
  test("env var wins over auth.json", () => {
    expect(
      resolveApiKey(
        { OPENROUTER_API_KEY: "env-key" },
        "/nonexistent/auth.json",
      ),
    ).toBe("env-key");
  });

  test("reads openrouter.key from auth.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "task-grade-"));
    const authPath = join(dir, "auth.json");
    writeFileSync(
      authPath,
      JSON.stringify({ openrouter: { type: "api_key", key: "file-key" } }),
    );
    expect(resolveApiKey({}, authPath)).toBe("file-key");
    rmSync(dir, { recursive: true, force: true });
  });

  test("missing or malformed sources resolve to undefined", () => {
    expect(resolveApiKey({}, "/nonexistent/auth.json")).toBeUndefined();
    const dir = mkdtempSync(join(tmpdir(), "task-grade-"));
    const authPath = join(dir, "auth.json");
    writeFileSync(authPath, "{not json");
    expect(resolveApiKey({}, authPath)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("gradeTask", () => {
  const baseOpts = (fetchImpl: typeof fetch) => ({
    fetchImpl,
    apiKey: "test-key",
    env: {},
    authPath: "/nonexistent/auth.json",
  });

  const okResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  test("maps a pro-leaning answer to the pro model", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)));
      return okResponse({
        model: "typesafe/jev-1.13-20260917",
        answers: {
          grade: {
            type: "choice",
            choice: "pro",
            probabilities: { flash: 0.2, pro: 0.8 },
          },
        },
        usage: { input_tokens: 400, cost: 0.00002 },
      });
    }) as unknown as typeof fetch;

    const result = await gradeTask(
      "Design the new auth API",
      baseOpts(fetchImpl),
    );

    expect(result).toEqual({
      model: DEFAULT_PRO_MODEL,
      grade: "pro",
      probability: 0.8,
      fallback: false,
      classifier: "typesafe/jev-1.13-20260917",
      cost: 0.00002,
    });
    // Request shape: classifier model, task state, static rubric
    expect(seen[0]?.model).toBe(DEFAULT_CLASSIFIER);
    expect(seen[0]?.state).toEqual({ task: "Design the new auth API" });
    expect(seen[0]?.questions).toEqual({ grade: buildQuestion() });
  });

  test("maps a flash answer to the flash model", async () => {
    const fetchImpl = (async () =>
      okResponse({
        model: "typesafe/jev-1.13-20260917",
        answers: {
          grade: {
            type: "choice",
            choice: "flash",
            probabilities: { flash: 1, pro: 0 },
          },
        },
        usage: { input_tokens: 380, cost: 0.00001 },
      })) as unknown as typeof fetch;

    const result = await gradeTask(
      "Fix the typo in README",
      baseOpts(fetchImpl),
    );
    expect(result.model).toBe(DEFAULT_FLASH_MODEL);
    expect(result.grade).toBe("flash");
    expect(result.fallback).toBe(false);
  });

  test("honors custom model ids", async () => {
    const fetchImpl = (async () =>
      okResponse({
        answers: {
          grade: {
            type: "choice",
            choice: "flash",
            probabilities: { flash: 1, pro: 0 },
          },
        },
      })) as unknown as typeof fetch;

    const result = await gradeTask("tiny fix", {
      ...baseOpts(fetchImpl),
      flashModel: "zai/custom-flash",
      proModel: "zai/custom-pro",
    });
    expect(result.model).toBe("zai/custom-flash");
  });

  test("falls back to flash on HTTP error", async () => {
    const fetchImpl = (async () =>
      new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const result = await gradeTask("x", baseOpts(fetchImpl));
    expect(result.model).toBe(DEFAULT_FLASH_MODEL);
    expect(result.grade).toBe("flash");
    expect(result.fallback).toBe(true);
    expect(result.reason).toContain("500");
  });

  test("falls back to flash when fetch throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await gradeTask("x", baseOpts(fetchImpl));
    expect(result.fallback).toBe(true);
    expect(result.model).toBe(DEFAULT_FLASH_MODEL);
    expect(result.reason).toContain("network down");
  });

  test("falls back to flash on an unusable answer", async () => {
    const fetchImpl = (async () =>
      okResponse({
        answers: { grade: { type: "score", score: 2 } },
      })) as unknown as typeof fetch;
    const result = await gradeTask("x", baseOpts(fetchImpl));
    expect(result.fallback).toBe(true);
    expect(result.model).toBe(DEFAULT_FLASH_MODEL);
  });

  test("falls back to flash without a key, without calling fetch", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return okResponse({});
    }) as unknown as typeof fetch;
    const result = await gradeTask("x", {
      fetchImpl,
      env: {},
      authPath: "/nonexistent/auth.json",
    });
    expect(result.fallback).toBe(true);
    expect(result.model).toBe(DEFAULT_FLASH_MODEL);
    expect(result.reason).toContain("API key");
    expect(called).toBe(false);
  });
});
