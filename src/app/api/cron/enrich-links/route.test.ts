import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/enrich-links", () => ({ enrichFlaggedLinks: vi.fn() }));

const { enrichFlaggedLinks } = await import("@/lib/enrich-links");
const { GET, runtime, maxDuration } = await import("./route");

const enrich = vi.mocked(enrichFlaggedLinks);

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/enrich-links", {
    headers,
  });
}

describe("GET /api/cron/enrich-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enrich.mockResolvedValue({ claimed: 3, enriched: 2, failed: 1 });
    vi.stubEnv("CRON_SECRET", "cr0n-s3cret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs on Node with room for a full batch", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(120);
  });

  it("answers 503 and runs nothing when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(request({ authorization: "Bearer " }));
    expect(res.status).toBe(503);
    expect(enrich).not.toHaveBeenCalled();
  });

  it("answers 503 when CRON_SECRET is blank", async () => {
    vi.stubEnv("CRON_SECRET", "   ");
    const res = await GET(request({ authorization: "Bearer cr0n-s3cret" }));
    expect(res.status).toBe(503);
    expect(enrich).not.toHaveBeenCalled();
  });

  it("answers 401 without an Authorization header", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(enrich).not.toHaveBeenCalled();
  });

  it("answers 401 with a wrong secret", async () => {
    for (const auth of [
      "Bearer wrong",
      "Bearer cr0n-s3cret-longer",
      "Basic cr0n-s3cret",
      "cr0n-s3cret",
    ]) {
      const res = await GET(request({ authorization: auth }));
      expect(res.status).toBe(401);
    }
    expect(enrich).not.toHaveBeenCalled();
  });

  it("runs the enrichment and returns its counts with the right secret", async () => {
    const res = await GET(request({ authorization: "Bearer cr0n-s3cret" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      claimed: 3,
      enriched: 2,
      failed: 1,
    });
    expect(enrich).toHaveBeenCalledTimes(1);
  });
});

describe("vercel.json", () => {
  it("schedules the enrichment cron every minute", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: { path: string; schedule: string }[] };
    expect(config.crons).toContainEqual({
      path: "/api/cron/enrich-links",
      schedule: "* * * * *",
    });
  });
});
