import { ROOT_FOLDER_NAME } from "@/lib/export-links";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionUser: mockGetSessionUser }));

const mockFolderFindMany = vi.fn();
const mockLinkFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    folder: { findMany: (...args: unknown[]) => mockFolderFindMany(...args) },
    link: { findMany: (...args: unknown[]) => mockLinkFindMany(...args) },
  },
}));

const { GET } = await import("./route");

describe("GET /api/links/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockFolderFindMany.mockResolvedValue([
      { id: "f1", name: "Reading", createdAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    mockLinkFindMany.mockResolvedValue([
      {
        url: "https://example.com",
        title: "Example",
        description: null,
        folderId: "f1",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
  });

  it("answers 401 without a session and loads nothing", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockFolderFindMany).not.toHaveBeenCalled();
    expect(mockLinkFindMany).not.toHaveBeenCalled();
  });

  it("loads the user's folders and links, then returns a bookmarks attachment", async () => {
    const res = await GET();

    expect(mockFolderFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    expect(mockLinkFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        url: true,
        title: true,
        description: true,
        folderId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="purl-bookmarks-\d{4}-\d{2}-\d{2}\.html"$/,
    );

    const html = await res.text();
    expect(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    expect(html).toContain(`<H3 PERSONAL_TOOLBAR_FOLDER="true">${ROOT_FOLDER_NAME}</H3>`);
    expect(html).toContain(">Reading</H3>");
    expect(html).toContain('HREF="https://example.com"');
  });
});