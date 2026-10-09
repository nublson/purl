import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: mockRevalidateTag,
  unstable_cache: <T>(fn: T) => fn,
}));

const { POST } = await import("./route");

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
  });
}

describe("POST /api/notion/revalidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NOTION_REVALIDATION_SECRET", "s3cret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("expires the Notion cache with the secret as a query param", async () => {
    const res = await POST(request("/api/notion/revalidate?secret=s3cret"));

    expect(res.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalledWith("notion", { expire: 0 });
  });

  it("accepts the secret as a bearer token", async () => {
    const res = await POST(
      request("/api/notion/revalidate", { authorization: "Bearer s3cret" }),
    );

    expect(res.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalledOnce();
  });

  it("rejects a wrong or missing secret", async () => {
    expect((await POST(request("/api/notion/revalidate?secret=nope"))).status).toBe(401);
    expect((await POST(request("/api/notion/revalidate"))).status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("rejects everything when no secret is configured", async () => {
    vi.stubEnv("NOTION_REVALIDATION_SECRET", "");

    expect((await POST(request("/api/notion/revalidate?secret="))).status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});
