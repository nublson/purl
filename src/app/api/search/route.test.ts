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

vi.mock("@/lib/semantic-search", () => ({
  semanticSearch: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { semanticSearch } = await import("@/lib/semantic-search");

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(semanticSearch).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET(getRequest("http://localhost/api/search?q=focus"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(semanticSearch).not.toHaveBeenCalled();
  });

  it("returns 400 when query is shorter than 3 chars", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);

    const res = await GET(getRequest("http://localhost/api/search?q=ab"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Query must be at least 3 characters",
    });
    expect(semanticSearch).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid content type", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);

    const res = await GET(
      getRequest("http://localhost/api/search?q=focus&type=INVALID"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid type. Use WEB, PDF, AUDIO, or YOUTUBE.",
    });
    expect(semanticSearch).not.toHaveBeenCalled();
  });

  it("returns linkId-only results for valid query and type", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(semanticSearch).mockResolvedValue([
      { linkId: "l1", similarity: 0.9 },
      { linkId: "l2", similarity: 0.8 },
    ]);

    const res = await GET(
      getRequest("http://localhost/api/search?q=deep%20work&type=pdf"),
    );

    expect(res.status).toBe(200);
    expect(semanticSearch).toHaveBeenCalledWith("deep work", "user-1", {
      type: "PDF",
      matchCount: 20,
    });
    expect(await res.json()).toEqual({
      results: [{ linkId: "l1" }, { linkId: "l2" }],
    });
  });
});
