import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetPage = vi.fn();
vi.mock("@/lib/public-folders", () => ({ getPublicFolderPage: mockGetPage }));

const { GET } = await import("./route");

const get = (query = "") =>
  GET(new NextRequest(`http://localhost/api/public/folders/nublson/design${query}`), {
    params: Promise.resolve({ username: "nublson", slug: "design" }),
  });

describe("GET /api/public/folders/[username]/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a page of links and the next cursor", async () => {
    mockGetPage.mockResolvedValue({
      kind: "folder",
      owner: {},
      folder: {},
      links: [{ id: "l1" }],
      nextCursor: "n",
    });
    const res = await get("?cursor=c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ links: [{ id: "l1" }], nextCursor: "n" });
    expect(mockGetPage).toHaveBeenCalledWith("nublson", "design", { cursor: "c1" });
  });

  it("is 404 for private, missing and renamed folders", async () => {
    mockGetPage.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    mockGetPage.mockResolvedValue({ kind: "redirect", username: "a", slug: "b" });
    expect((await get()).status).toBe(404);
  });
});
