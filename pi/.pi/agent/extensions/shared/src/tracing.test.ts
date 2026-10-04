import { describe, it, expect, afterEach, beforeEach, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock OpenTelemetry SDK modules to prevent real connections
mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start() {}
  },
}));

mock.module("@langfuse/otel", () => ({
  LangfuseSpanProcessor: class {},
}));

import { initTracing } from "./tracing";

describe("initTracing", () => {
  // Save original env vars to restore after tests
  const origPublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const origSecretKey = process.env.LANGFUSE_SECRET_KEY;
  const origHost = process.env.LANGFUSE_HOST;
  const origAgentDir = process.env.PI_CODING_AGENT_DIR;

  // Isolate from the developer's real auth.json (may contain a langfuse entry)
  beforeEach(() => {
    process.env.PI_CODING_AGENT_DIR = join(tmpdir(), "no-such-pi-auth-dir");
  });

  afterEach(() => {
    // Restore originals
    if (origPublicKey !== undefined) process.env.LANGFUSE_PUBLIC_KEY = origPublicKey;
    else delete process.env.LANGFUSE_PUBLIC_KEY;
    if (origSecretKey !== undefined) process.env.LANGFUSE_SECRET_KEY = origSecretKey;
    else delete process.env.LANGFUSE_SECRET_KEY;
    if (origHost !== undefined) process.env.LANGFUSE_HOST = origHost;
    else delete process.env.LANGFUSE_HOST;
    if (origAgentDir !== undefined) process.env.PI_CODING_AGENT_DIR = origAgentDir;
    else delete process.env.PI_CODING_AGENT_DIR;
  });

  it("returns a no-op tracer when LANGFUSE env vars are not set", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;

    const tracing = initTracing();

    expect(tracing.startObservation).toBeDefined();
    expect(typeof tracing.startObservation).toBe("function");

    // startObservation should return a no-op span
    const span = tracing.startObservation("test-span", {
      input: { query: "test" },
      metadata: { cwd: "/tmp" },
    });

    expect(span).toBeDefined();
    expect(typeof span.update).toBe("function");
    expect(typeof span.end).toBe("function");
    expect(typeof span.startObservation).toBe("function");

    // No-op span methods must not throw
    expect(() => span.update({ output: "result" })).not.toThrow();
    expect(() => span.end()).not.toThrow();

    // Child span should also be no-op
    const child = span.startObservation("child-span", {
      input: { file: "test.ts" },
    });
    expect(child).toBeDefined();
    expect(typeof child.end).toBe("function");
    expect(() => child.end()).not.toThrow();
  });

  it("returns a real tracer when LANGFUSE env vars are set", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test-key";
    process.env.LANGFUSE_SECRET_KEY = "sk-test-key";
    process.env.LANGFUSE_HOST = "https://example.com";

    const tracing = initTracing();

    expect(tracing.startObservation).toBeDefined();
    expect(typeof tracing.startObservation).toBe("function");

    // Should return an observation with expected methods
    const span = tracing.startObservation("test-span", {
      input: { query: "test" },
    });

    expect(span).toBeDefined();
    expect(typeof span.update).toBe("function");
    expect(typeof span.end).toBe("function");
    expect(typeof span.startObservation).toBe("function");

    // Methods must not throw
    expect(() => span.update({ output: "result" })).not.toThrow();
    expect(() => span.end()).not.toThrow();
  });

  it("returns the same singleton instance on repeated calls (no env vars)", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;

    const a = initTracing();
    const b = initTracing();

    expect(a).toBe(b);
  });

  it("returns the same singleton instance on repeated calls (with env vars)", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-singleton";
    process.env.LANGFUSE_SECRET_KEY = "sk-singleton";
    process.env.LANGFUSE_HOST = "https://example.com";

    const a = initTracing();
    const b = initTracing();

    expect(a).toBe(b);
  });

  it("returns distinct objects for no-op vs real tracing", () => {
    // Verify the no-op and real code paths produce different instances
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;
    const noopInstance = initTracing();

    process.env.LANGFUSE_PUBLIC_KEY = "pk-distinct";
    process.env.LANGFUSE_SECRET_KEY = "sk-distinct";
    process.env.LANGFUSE_HOST = "https://example.com";
    const realInstance = initTracing();

    // noop constant and real singleton must be different objects
    expect(noopInstance).not.toBe(realInstance);
  });

  it("enables real tracing from a langfuse auth.json entry when env is unset", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;

    const emptyDir = mkdtempSync(join(tmpdir(), "pi-auth-empty-"));
    process.env.PI_CODING_AGENT_DIR = emptyDir;
    const noopInstance = initTracing();

    const authDir = mkdtempSync(join(tmpdir(), "pi-auth-langfuse-"));
    writeFileSync(
      join(authDir, "auth.json"),
      JSON.stringify({
        langfuse: {
          type: "api_key",
          key: "pk-auth",
          env: { LANGFUSE_SECRET_KEY: "sk-auth", LANGFUSE_HOST: "https://example.com" },
        },
      }),
    );
    process.env.PI_CODING_AGENT_DIR = authDir;
    const realInstance = initTracing();

    expect(realInstance).not.toBe(noopInstance);
    rmSync(emptyDir, { recursive: true, force: true });
    rmSync(authDir, { recursive: true, force: true });
  });
});
