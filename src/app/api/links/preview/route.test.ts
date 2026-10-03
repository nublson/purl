import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionUser: mockGetSessionUser }));

const mockResolve = vi.fn();
const mockIsSaved = vi.fn();
vi.mock("@/lib/links", () => ({
  resolveLinkFromUrl: mockResolve,
  isUrlSavedForUser: mockIsSaved,
}));

const { GET } = await import("./route");

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/links/preview${query}`));

const PREVIEW = {
  url: "https://example.com/",
  domain: "example.com",
  title: "Example Domain",
  description: null,
  favicon: "https://example.com/favicon.ico",
  thumbnail: null,
  contentType: "WEB",
};

describe("GET /api/links/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockResolve.mockResolvedValue(PREVIEW);
    mockIsSaved.mockResolvedValue(false);
  });

  it("resolves the URL's metadata without saving, and says whether it's saved", async () => {
    mockIsSaved.mockResolvedValue(true);
    const res = await get("?url=example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...PREVIEW, saved: true });
    expect(mockResolve).toHaveBeenCalledWith("https://example.com/");
    expect(mockIsSaved).toHaveBeenCalledWith("user-1", ["example.com", "https://example.com/"]);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects a missing or invalid URL", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?url=not%20a%20url")).status).toBe(400);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    expect((await get("?url=example.com")).status).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
