import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockResolve = vi.fn();
const mockList = vi.fn();
vi.mock("@/lib/public-folders", () => ({
  resolvePublicFolder: mockResolve,
  listPublicFolderLinks: mockList,
}));

const { GET } = await import("./route");

const get = (url = "http://localhost:3000/u/nublson/design/feed.xml") =>
  GET(new NextRequest(url), {
    params: Promise.resolve({ username: "nublson", slug: "design" }),
  });

const ids = { userId: "u1", folderId: "f1" };

describe("GET /@username/slug/feed.xml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BASE_URL", "https://purl.live");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("serves an Atom feed of the folder's first page of links", async () => {
    mockResolve.mockResolvedValue({
      kind: "folder",
      owner: { name: "Nub", image: null, username: "nublson" },
      folder: {
        name: "Design",
        slug: "design",
        emoji: "🎨",
        description: null,
      },
      ids,
    });
    mockList.mockResolvedValue({
      links: [
        {
          id: "l1",
          url: "https://example.com/a",
          title: "A",
          description: null,
          thumbnail: null,
          domain: "example.com",
          favicon: null,
          contentType: "WEB",
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      nextCursor: null,
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/atom+xml; charset=utf-8",
    );
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    const body = await res.text();
    expect(body).toContain("🎨 Design by @nublson");
    expect(body).toContain("tag:purl.live,2026:link:l1");
    expect(mockList).toHaveBeenCalledWith(ids);
  });

  it("is 404 for private or missing folders, uncached", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control") ?? "").not.toContain("public");
    expect(await res.text()).not.toContain("Design");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("redirects a renamed username or slug to the new feed URL", async () => {
    mockResolve.mockResolvedValue({
      kind: "redirect",
      username: "new",
      slug: "renamed",
    });
    const res = await get();
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toMatch(/\/@new\/renamed\/feed\.xml$/);
    expect(res.headers.get("Cache-Control") ?? "").not.toContain("public");
  });

  it("redirects on BASE_URL, not the request host", async () => {
    mockResolve.mockResolvedValue({ kind: "redirect", username: "new", slug: "renamed" });
    const res = await get("https://internal.example.com/u/old/renamed/feed.xml");
    expect(res.headers.get("Location")).toBe("https://purl.live/@new/renamed/feed.xml");
  });

  it("falls back to the request's origin without BASE_URL", async () => {
    vi.stubEnv("BASE_URL", "");
    mockResolve.mockResolvedValue({
      kind: "folder",
      owner: { name: "Nub", image: null, username: "nublson" },
      folder: { name: "Design", slug: "design", emoji: "🎨", description: null },
      ids,
    });
    mockList.mockResolvedValue({ links: [], nextCursor: null });
    const body = await (await get("https://preview.example.com/u/nublson/design/feed.xml")).text();
    expect(body).toContain("https://preview.example.com/@nublson/design/feed.xml");
    expect(body).not.toContain("https://purl.live");
  });
});
