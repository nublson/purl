import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: mockRevalidateTag,
  unstable_cache: <T>(fn: T) => fn,
}));

const { POST } = await import("./route");

function request(
  path: string,
  headers: Record<string, string> = {},
  body?: string,
) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body,
  });
}

function sign(body: string, key = "secret_verify") {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

describe("POST /api/notion/revalidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NOTION_REVALIDATION_SECRET", "s3cret");
    vi.stubEnv("NOTION_WEBHOOK_SECRET", "secret_verify");
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

  it("expires the cache for a correctly signed Notion event", async () => {
    const body = JSON.stringify({ type: "page.content_updated" });
    const res = await POST(
      request("/api/notion/revalidate", { "x-notion-signature": sign(body) }, body),
    );

    expect(res.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalledWith("notion", { expire: 0 });
  });

  it("rejects a Notion event with a wrong signature", async () => {
    const body = JSON.stringify({ type: "page.content_updated" });
    const res = await POST(
      request(
        "/api/notion/revalidate",
        { "x-notion-signature": sign(body, "other") },
        body,
      ),
    );

    expect(res.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("rejects signed events while no webhook secret is set", async () => {
    vi.stubEnv("NOTION_WEBHOOK_SECRET", "");
    const body = "{}";
    const res = await POST(
      request("/api/notion/revalidate", { "x-notion-signature": sign(body) }, body),
    );

    expect(res.status).toBe(401);
  });

  it("logs the verification token without revalidating", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await POST(
      request(
        "/api/notion/revalidate",
        {},
        JSON.stringify({ verification_token: "secret_abc" }),
      ),
    );

    expect(res.status).toBe(200);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("secret_abc"));
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
