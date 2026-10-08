import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();
const mockFolderFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mockUserFindUnique },
    folder: { findMany: mockFolderFindMany },
  },
}));

const { getDemoFolders } = await import("./demo-folders");

const USER = { id: "u1", name: "Purl", image: null, username: "purl" };
const LINK = {
  id: "l1",
  url: "https://a.example",
  title: "A",
  description: null,
  thumbnail: null,
  domain: "a.example",
  favicon: "https://a.example/favicon.ico",
  contentType: "WEB",
  createdAt: new Date("2026-10-01T00:00:00Z"),
};

describe("getDemoFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(USER);
    mockFolderFindMany.mockResolvedValue([]);
  });

  it("returns null when the user is missing", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    expect(await getDemoFolders()).toBeNull();
    expect(mockFolderFindMany).not.toHaveBeenCalled();
  });

  it("returns null when there are no public folders", async () => {
    expect(await getDemoFolders()).toBeNull();
  });

  it("queries the current username's public folders by name, newest 20 links each", async () => {
    mockFolderFindMany.mockResolvedValue([
      { id: "f1", name: "A", slug: "a", emoji: null, description: "", links: [LINK], _count: { links: 1 } },
    ]);
    await getDemoFolders("Purl");
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: "purl" } }),
    );
    const args = mockFolderFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1", isPublic: true });
    expect(args.orderBy).toEqual([{ position: "asc" }, { name: "asc" }]);
    expect(args.select.links).toMatchObject({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });

  it("returns only public fields, with default emoji and null description", async () => {
    mockFolderFindMany.mockResolvedValue([
      {
        id: "f1",
        name: "A",
        slug: "a",
        emoji: null,
        description: "",
        isPublic: true,
        userId: "u1",
        links: [{ ...LINK, userId: "u1", folderId: "f1", readAt: null }],
        _count: { links: 1 },
      },
    ]);
    const data = await getDemoFolders();
    expect(data).toEqual({
      owner: { name: "Purl", image: null, username: "purl" },
      folders: [
        {
          id: "f1",
          name: "A",
          slug: "a",
          emoji: "🦪",
          description: null,
          linkCount: 1,
          links: [LINK],
        },
      ],
    });
  });

  it("counts every link in the folder, not just the 20 it returns", async () => {
    mockFolderFindMany.mockResolvedValue([
      { id: "f1", name: "A", slug: "a", emoji: null, description: "", links: [LINK], _count: { links: 50 } },
    ]);
    const data = await getDemoFolders();
    expect(data?.folders[0]).toMatchObject({ linkCount: 50, links: [LINK] });
    const args = mockFolderFindMany.mock.calls[0][0];
    expect(args.select._count).toEqual({ select: { links: { where: { userId: "u1" } } } });
  });
});
