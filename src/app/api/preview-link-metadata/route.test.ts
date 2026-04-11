import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/links", () => ({
  resolveLinkFromUrl: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { resolveLinkFromUrl } = await import("@/lib/links");

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/preview-link-metadata", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(resolveLinkFromUrl).mockReset();
  });

  it("returns 400 when url is missing", async () => {
    const res = await GET(getRequest("http://localhost/api/preview-link-metadata"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid URL" });
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(resolveLinkFromUrl).not.toHaveBeenCalled();
  });

  it("returns 400 when url is invalid", async () => {
    const res = await GET(
      getRequest("http://localhost/api/preview-link-metadata?url=not-a-url"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid URL" });
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(resolveLinkFromUrl).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET(
      getRequest(
        "http://localhost/api/preview-link-metadata?url=https%3A%2F%2Fexample.com%2F",
      ),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(resolveLinkFromUrl).not.toHaveBeenCalled();
  });

  it("returns 200 with resolved metadata when authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    const payload = {
      url: "https://example.com/",
      domain: "example.com",
      contentType: "WEB" as const,
      title: "Example",
      description: null,
      favicon: "https://example.com/favicon.ico",
      thumbnail: null,
    };
    vi.mocked(resolveLinkFromUrl).mockResolvedValue(payload);

    const res = await GET(
      getRequest(
        "http://localhost/api/preview-link-metadata?url=https%3A%2F%2Fexample.com%2F",
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(resolveLinkFromUrl).toHaveBeenCalledWith("https://example.com/");
  });

  it("returns 502 when resolveLinkFromUrl throws", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(resolveLinkFromUrl).mockRejectedValue(new Error("network"));

    const res = await GET(
      getRequest(
        "http://localhost/api/preview-link-metadata?url=https%3A%2F%2Fexample.com%2F",
      ),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to fetch metadata" });
  });
});
