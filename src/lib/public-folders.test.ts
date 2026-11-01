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

const {
  getPublicFolderPage,
  listPublicFolderLinks,
  publicFolderPath,
  PUBLIC_FOLDER_PAGE_SIZE,
  resolvePublicFolder,
} = await import("./public-folders");

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
  mimeType: "image/png",
  width: 800,
  height: 600,
  duration: null,
  embed: false,
  // Private fields the page must not expose:
  userId: "u1",
  folderId: "f1",
  fileKey: "users/u1/c1/a.png",
  fileSize: 1234,
};

/** What visitors get for LINK_ROW: `upload` instead of the file key and size. */
const PUBLIC_LINK = {
  id: "l1",
  url: "https://a.example",
  title: "A",
  description: "About A",
  thumbnail: "https://a.example/og.png",
  domain: "a.example",
  favicon: "https://a.example/favicon.ico",
  contentType: "WEB",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  mimeType: "image/png",
  width: 800,
  height: 600,
  duration: null,
  embed: false,
  upload: true,
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
      links: [PUBLIC_LINK],
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

describe("resolvePublicFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(OWNER);
    mockFolderFindFirst.mockResolvedValue(FOLDER);
    mockUsernameRedirect.mockResolvedValue(null);
    mockSlugRedirect.mockResolvedValue(null);
  });

  it("returns folder metadata and server ids without loading links", async () => {
    const resolved = await resolvePublicFolder("NUBLSON", "Design");
    expect(mockListLinks).not.toHaveBeenCalled();
    expect(resolved).toEqual({
      kind: "folder",
      owner: { name: "Nubelson", image: "https://img/a.png", username: "nublson" },
      folder: { name: "Design", slug: "design", emoji: "🦪", description: "Good stuff" },
      ids: { userId: "u1", folderId: "f1" },
    });
  });

  it("redirects when only the slug changed, without listing links", async () => {
    mockFolderFindFirst.mockResolvedValue(null);
    mockSlugRedirect.mockResolvedValue({ folder: { ...FOLDER, slug: "design-v2" } });
    expect(await resolvePublicFolder("nublson", "design")).toEqual({
      kind: "redirect",
      username: "nublson",
      slug: "design-v2",
    });
    expect(mockListLinks).not.toHaveBeenCalled();
  });
});

describe("listPublicFolderLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListLinks.mockResolvedValue({ links: [LINK_ROW], nextCursor: null });
  });

  it("defaults to PUBLIC_FOLDER_PAGE_SIZE and strips private fields", async () => {
    const { links, nextCursor } = await listPublicFolderLinks({
      userId: "u1",
      folderId: "f1",
    });
    expect(mockListLinks).toHaveBeenCalledWith("u1", {
      limit: PUBLIC_FOLDER_PAGE_SIZE,
      cursor: null,
      contentType: null,
      folderId: "f1",
    });
    expect(links).toEqual([PUBLIC_LINK]);
    expect(nextCursor).toBeNull();
  });

  it("clamps custom limits between 1 and twice the page size", async () => {
    await listPublicFolderLinks({ userId: "u1", folderId: "f1" }, { limit: 0 });
    expect(mockListLinks.mock.calls[0][1].limit).toBe(1);

    await listPublicFolderLinks({ userId: "u1", folderId: "f1" }, { limit: 999 });
    expect(mockListLinks.mock.calls[1][1].limit).toBe(PUBLIC_FOLDER_PAGE_SIZE * 2);

    await listPublicFolderLinks({ userId: "u1", folderId: "f1" }, { limit: 12.9 });
    expect(mockListLinks.mock.calls[2][1].limit).toBe(12);
  });
});

describe("publicFolderPath", () => {
  it("is /@username/slug", () => {
    expect(publicFolderPath("nublson", "design")).toBe("/@nublson/design");
  });
});
