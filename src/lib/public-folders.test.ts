import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockUserFindUnique = vi.fn();
const mockUsernameRedirect = vi.fn();
const mockFolderFindFirst = vi.fn();
const mockSlugRedirect = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mockUserFindUnique },
    usernameRedirect: { findUnique: mockUsernameRedirect },
    folder: { findFirst: mockFolderFindFirst },
    folderSlugRedirect: { findUnique: mockSlugRedirect },
  },
}));

const mockListLinks = vi.fn();
vi.mock("@/lib/links", () => ({ listLinksForUser: mockListLinks }));

const { getPublicFolderPage, publicFolderPath } = await import("./public-folders");

const OWNER = { id: "u1", name: "Nubelson", image: "https://img/a.png", username: "nublson" };
const FOLDER = {
  id: "f1",
  name: "Design",
  slug: "design",
  emoji: null,
  description: "Good stuff",
  isPublic: true,
};
const LINK_ROW = {
  id: "l1",
  url: "https://a.example",
  title: "A",
  domain: "a.example",
  favicon: "https://a.example/favicon.ico",
  contentType: "WEB",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  description: "About A",
  thumbnail: "https://a.example/og.png",
  // Private fields the page must not expose:
  userId: "u1",
  folderId: "f1",
};

describe("getPublicFolderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(OWNER);
    mockFolderFindFirst.mockResolvedValue(FOLDER);
    mockUsernameRedirect.mockResolvedValue(null);
    mockSlugRedirect.mockResolvedValue(null);
    mockListLinks.mockResolvedValue({ links: [LINK_ROW], nextCursor: "next" });
  });

  it("returns the owner, folder and a page of links with only public fields", async () => {
    const page = await getPublicFolderPage("NUBLSON", "Design", { cursor: "c1" });
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: "nublson" } }),
    );
    expect(mockListLinks).toHaveBeenCalledWith("u1", {
      limit: 50,
      cursor: "c1",
      contentType: null,
      folderId: "f1",
    });
    expect(page).toEqual({
      kind: "folder",
      owner: { name: "Nubelson", image: "https://img/a.png", username: "nublson" },
      folder: { name: "Design", slug: "design", emoji: "🦪", description: "Good stuff" },
      links: [
        {
          id: "l1",
          url: "https://a.example",
          title: "A",
          description: "About A",
          thumbnail: "https://a.example/og.png",
          domain: "a.example",
          favicon: "https://a.example/favicon.ico",
          contentType: "WEB",
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      nextCursor: "next",
    });
  });

  it("is null for a private folder, exactly like a missing one", async () => {
    mockFolderFindFirst.mockResolvedValue({ ...FOLDER, isPublic: false });
    expect(await getPublicFolderPage("nublson", "design")).toBeNull();
    mockFolderFindFirst.mockResolvedValue(null);
    expect(await getPublicFolderPage("nublson", "nope")).toBeNull();
    mockUserFindUnique.mockResolvedValue(null);
    expect(await getPublicFolderPage("nobody", "design")).toBeNull();
    expect(mockListLinks).not.toHaveBeenCalled();
  });

  it("redirects an old slug to the folder's current one", async () => {
    mockFolderFindFirst.mockResolvedValue(null);
    mockSlugRedirect.mockResolvedValue({ folder: { ...FOLDER, slug: "design-engineering" } });
    expect(await getPublicFolderPage("nublson", "design")).toEqual({
      kind: "redirect",
      username: "nublson",
      slug: "design-engineering",
    });
  });

  it("redirects an old username to the current one", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUsernameRedirect.mockResolvedValue({ user: OWNER });
    expect(await getPublicFolderPage("old-name", "design")).toEqual({
      kind: "redirect",
      username: "nublson",
      slug: "design",
    });
  });

  it("doesn't redirect to a folder that isn't public", async () => {
    mockFolderFindFirst.mockResolvedValue(null);
    mockSlugRedirect.mockResolvedValue({ folder: { ...FOLDER, isPublic: false } });
    expect(await getPublicFolderPage("nublson", "design")).toBeNull();
  });
});

describe("publicFolderPath", () => {
  it("is /@username/slug", () => {
    expect(publicFolderPath("nublson", "design")).toBe("/@nublson/design");
  });
});
