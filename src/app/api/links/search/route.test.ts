import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionUser: mockGetSessionUser }));

const mockSearch = vi.fn();
vi.mock("@/lib/links", () => ({ searchLinksForUser: mockSearch }));

class MockFolderNotFoundError extends Error {}
vi.mock("@/lib/folders", () => ({ FolderNotFoundError: MockFolderNotFoundError }));

vi.mock("@/lib/serialize-link", () => ({ serializeLink: (link: unknown) => link }));

const { GET } = await import("./route");

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/links/search${query}`));

describe("GET /api/links/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockSearch.mockResolvedValue({ links: [{ id: "l1" }], hasMore: true });
  });

  it("searches with the query, folder to leave out and limit", async () => {
    const res = await get("?q=react&notInFolderId=f1&limit=20");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ links: [{ id: "l1" }], hasMore: true });
    expect(mockSearch).toHaveBeenCalledWith("user-1", {
      query: "react",
      notInFolderId: "f1",
      limit: 20,
    });
  });

  it("defaults to everything, 50 at a time, and ignores a bad limit", async () => {
    await get("?limit=abc");
    expect(mockSearch).toHaveBeenCalledWith("user-1", {
      query: "",
      notInFolderId: undefined,
      limit: 50,
    });
  });

  it("returns 401 without a session and 404 for someone else's folder", async () => {
    mockGetSessionUser.mockResolvedValueOnce(null);
    expect((await get("")).status).toBe(401);

    mockSearch.mockRejectedValueOnce(new MockFolderNotFoundError());
    expect((await get("?notInFolderId=nope")).status).toBe(404);
  });
});
