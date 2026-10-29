import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fakes for both Upstash packages, for every case in this file: a `doMock`
// after the real package has been loaded doesn't take, so the real ones are
// never loaded here. `vi.resetModules()` + a fresh import resets the module's
// cached limiters between cases.
const upstash = vi.hoisted(() => {
  const slidingWindow = vi.fn();
  const ratelimitCtor = vi.fn();
  const redisCtor = vi.fn();
  class FakeRatelimit {
    static slidingWindow = slidingWindow;
    constructor(options: unknown) {
      ratelimitCtor(options);
    }
  }
  class FakeRedis {
    constructor(options: unknown) {
      redisCtor(options);
    }
  }
  return { slidingWindow, ratelimitCtor, redisCtor, FakeRatelimit, FakeRedis };
});

vi.mock("@upstash/ratelimit", () => ({ Ratelimit: upstash.FakeRatelimit }));
vi.mock("@upstash/redis", () => ({ Redis: upstash.FakeRedis }));

async function loadModule() {
  vi.resetModules();
  return import("./upstash-rate-limit");
}

function stubUpstashEnv() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
}

beforeEach(() => {
  upstash.slidingWindow.mockReset().mockReturnValue("limiter-config");
  upstash.ratelimitCtor.mockReset();
  upstash.redisCtor.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("upstash-rate-limit production fail-fast", () => {
  it("throws in production when Upstash env vars are missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const { getAuthRateLimiter } = await loadModule();

    expect(() => getAuthRateLimiter()).toThrow(
      "[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production.",
    );
  });

  it("returns null in development when Upstash env vars are missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const { getAuthRateLimiter } = await loadModule();

    expect(getAuthRateLimiter()).toBeNull();
    expect(upstash.redisCtor).not.toHaveBeenCalled();
  });
});

describe("links_import bucket", () => {
  it("allows 30 imports per minute under its own prefix, cached", async () => {
    stubUpstashEnv();

    const { getLinksImportRateLimiter } = await loadModule();
    const first = getLinksImportRateLimiter();

    expect(first).not.toBeNull();
    expect(upstash.redisCtor).toHaveBeenCalledWith({
      url: "https://redis.test",
      token: "token",
    });
    expect(upstash.slidingWindow).toHaveBeenCalledWith(30, "1 m");
    expect(upstash.ratelimitCtor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "purl:rl:links_import" }),
    );
    expect(getLinksImportRateLimiter()).toBe(first);
    expect(upstash.ratelimitCtor).toHaveBeenCalledTimes(1);
  });

  it("returns null in development without Upstash env vars", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { getLinksImportRateLimiter } = await loadModule();
    expect(getLinksImportRateLimiter()).toBeNull();
  });
});

describe("upload token buckets", () => {
  it("allows 120 tokens per minute per IP (two per file), cached", async () => {
    stubUpstashEnv();
    const mod = await loadModule();
    const first = mod.getUploadsTokenRateLimiter();

    expect(first).not.toBeNull();
    expect(upstash.slidingWindow).toHaveBeenCalledWith(120, "1 m");
    expect(upstash.ratelimitCtor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "purl:rl:uploads_token" }),
    );
    expect(mod.getUploadsTokenRateLimiter()).toBe(first);
    expect(upstash.ratelimitCtor).toHaveBeenCalledTimes(1);
  });

  it("allows 240 tokens per hour per user, cached", async () => {
    stubUpstashEnv();
    const mod = await loadModule();
    const first = mod.getUploadsTokenUserRateLimiter();

    expect(first).not.toBeNull();
    expect(upstash.slidingWindow).toHaveBeenCalledWith(240, "1 h");
    expect(upstash.ratelimitCtor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "purl:rl:uploads_token_user" }),
    );
    expect(mod.getUploadsTokenUserRateLimiter()).toBe(first);
    expect(upstash.ratelimitCtor).toHaveBeenCalledTimes(1);
  });

  it("returns null for both in development without Upstash env vars", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const mod = await loadModule();
    expect(mod.getUploadsTokenRateLimiter()).toBeNull();
    expect(mod.getUploadsTokenUserRateLimiter()).toBeNull();
  });
});
