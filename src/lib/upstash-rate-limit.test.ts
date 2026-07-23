import { afterEach, describe, expect, it, vi } from "vitest";

describe("upstash-rate-limit production fail-fast", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("throws in production when Upstash env vars are missing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const { getAuthRateLimiter } = await import("./upstash-rate-limit");

    expect(() => getAuthRateLimiter()).toThrow(
      "[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production.",
    );
  });

  it("returns null in development when Upstash env vars are missing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const { getAuthRateLimiter } = await import("./upstash-rate-limit");

    expect(getAuthRateLimiter()).toBeNull();
  });
});
