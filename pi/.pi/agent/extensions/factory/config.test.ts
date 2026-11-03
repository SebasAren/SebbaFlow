import { describe, it, expect } from "bun:test";
import { DEFAULT_BASE_URL, resolveFactoryConfig } from "./config";

describe("resolveFactoryConfig", () => {
  it("falls back to the default base URL and no token", () => {
    const config = resolveFactoryConfig({}, {});
    expect(config).toEqual({ baseUrl: DEFAULT_BASE_URL });
    expect(DEFAULT_BASE_URL).toBe("http://localhost:4111");
  });

  it("prefers env vars over the auth.json entry", () => {
    const config = resolveFactoryConfig(
      { FACTORY_BASE_URL: "http://localhost:5000", FACTORY_TOKEN: "env-token" },
      { factory: { type: "api", key: "auth-token", baseUrl: "http://localhost:6000" } },
    );
    expect(config.baseUrl).toBe("http://localhost:5000");
    expect(config.token).toBe("env-token");
  });

  it("uses the auth.json factory entry when env is unset", () => {
    const config = resolveFactoryConfig(
      {},
      { factory: { type: "api", key: "auth-token", baseUrl: "http://localhost:6000" } },
    );
    expect(config.baseUrl).toBe("http://localhost:6000");
    expect(config.token).toBe("auth-token");
  });

  it("uses only the auth.json token when the entry has no baseUrl", () => {
    const config = resolveFactoryConfig({}, { factory: { type: "api", key: "auth-token" } });
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.token).toBe("auth-token");
  });

  it("ignores empty env values", () => {
    const config = resolveFactoryConfig({ FACTORY_TOKEN: "", FACTORY_BASE_URL: "" }, {});
    expect(config.token).toBeUndefined();
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  });
});
