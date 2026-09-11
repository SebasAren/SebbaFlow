import { describe, it, expect, afterEach } from "bun:test";
import { getModel, getFallbackModel, shouldUseFallback } from "./model";

describe("getModel", () => {
  const original = process.env.CHEAP_MODEL;

  afterEach(() => {
    if (original !== undefined) process.env.CHEAP_MODEL = original;
    else delete process.env.CHEAP_MODEL;
  });

  it("returns CHEAP_MODEL when set", () => {
    process.env.CHEAP_MODEL = "my-model";
    expect(getModel()).toBe("my-model");
  });

  it("returns undefined when CHEAP_MODEL is not set", () => {
    delete process.env.CHEAP_MODEL;
    expect(getModel()).toBeUndefined();
  });
});

describe("getFallbackModel", () => {
  const original = process.env.FALLBACK_MODEL;

  afterEach(() => {
    if (original !== undefined) process.env.FALLBACK_MODEL = original;
    else delete process.env.FALLBACK_MODEL;
  });

  it("returns FALLBACK_MODEL when set", () => {
    process.env.FALLBACK_MODEL = "my-fallback";
    expect(getFallbackModel()).toBe("my-fallback");
  });

  it("returns undefined when FALLBACK_MODEL is not set", () => {
    delete process.env.FALLBACK_MODEL;
    expect(getFallbackModel()).toBeUndefined();
  });
});

describe("shouldUseFallback", () => {
  it("matches rate limit errors", () => {
    expect(shouldUseFallback("429 Rate limit exceeded")).toBe(true);
    expect(shouldUseFallback("rate_limit_error")).toBe(true);
    expect(shouldUseFallback("Too many requests")).toBe(true);
  });

  it("matches server errors", () => {
    expect(shouldUseFallback("503 Service Unavailable")).toBe(true);
    expect(shouldUseFallback("502 Bad Gateway")).toBe(true);
    expect(shouldUseFallback("500 Internal Server Error")).toBe(true);
    expect(shouldUseFallback("504 Gateway Timeout")).toBe(true);
    expect(shouldUseFallback("internal_server_error")).toBe(true);
  });

  it("matches overload errors", () => {
    expect(shouldUseFallback("Model overloaded")).toBe(true);
    expect(shouldUseFallback("service unavailable")).toBe(true);
  });

  it("matches connection errors", () => {
    expect(shouldUseFallback("ECONNREFUSED")).toBe(true);
    expect(shouldUseFallback("ECONNRESET")).toBe(true);
    expect(shouldUseFallback("ETIMEDOUT")).toBe(true);
    expect(shouldUseFallback("connection refused")).toBe(true);
    expect(shouldUseFallback("connection_reset by peer")).toBe(true);
  });

  it("matches timeout errors", () => {
    expect(shouldUseFallback("Request timeout")).toBe(true);
    expect(shouldUseFallback("timed out")).toBe(true);
  });

  it("matches upstream errors from providers (e.g. OpenRouter)", () => {
    expect(
      shouldUseFallback(
        "Upstream error from Inception: The server had an error while processing your request.",
      ),
    ).toBe(true);
    expect(shouldUseFallback("upstream_error")).toBe(true);
    expect(shouldUseFallback("Upstream service error")).toBe(true);
  });

  it("matches 'server had an error' messages", () => {
    expect(shouldUseFallback("The server had an error while processing your request.")).toBe(true);
  });

  it("matches dropped-stream errors from openai-completions providers", () => {
    expect(shouldUseFallback("Stream ended without finish_reason")).toBe(true);
    expect(shouldUseFallback("Provider finish_reason: network_error")).toBe(true);
  });

  it("matches opaque gateway 4xx errors with no body", () => {
    expect(shouldUseFallback("400 status code (no body)")).toBe(true);
    expect(shouldUseFallback("413 status code (no body)")).toBe(true);
    expect(shouldUseFallback("OpenAI API error: 400 status code (no body)")).toBe(true);
  });

  it("does not match non-transient errors", () => {
    expect(shouldUseFallback("Invalid API key")).toBe(false);
    expect(shouldUseFallback("Permission denied")).toBe(false);
    expect(shouldUseFallback("Model not found")).toBe(false);
    expect(shouldUseFallback("Invalid request")).toBe(false);
  });

  it("handles undefined and empty strings", () => {
    expect(shouldUseFallback(undefined)).toBe(false);
    expect(shouldUseFallback("")).toBe(false);
  });
});
