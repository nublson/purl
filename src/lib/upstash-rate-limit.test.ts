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

describe("links_import bucket", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
  });

  it("allows 30 imports per minute under its own prefix, cached", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    const slidingWindow = vi.fn().mockReturnValue("limiter-config");
    const ctor = vi.fn();
    class FakeRatelimit {
      static slidingWindow = slidingWindow;
      constructor(options: unknown) {
        ctor(options);
      }
    }
    vi.doMock("@upstash/ratelimit", () => ({ Ratelimit: FakeRatelimit }));
    vi.doMock("@upstash/redis", () => ({ Redis: class {} }));

    const { getLinksImportRateLimiter } = await import("./upstash-rate-limit");
    const first = getLinksImportRateLimiter();

    expect(first).not.toBeNull();
    expect(slidingWindow).toHaveBeenCalledWith(30, "1 m");
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "purl:rl:links_import" }),
    );
    expect(getLinksImportRateLimiter()).toBe(first);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("returns null in development without Upstash env vars", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { getLinksImportRateLimiter } = await import("./upstash-rate-limit");
    expect(getLinksImportRateLimiter()).toBeNull();
  });
});
