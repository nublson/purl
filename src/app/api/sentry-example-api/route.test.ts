import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/sentry-example-api", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns 404 in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./route");
    const res = GET();
    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(404);
  });

  it("throws when enabled (non-production)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const { GET } = await import("./route");
    try {
      GET();
      expect.fail("expected GET to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe("SentryExampleAPIError");
    }
  });
});
