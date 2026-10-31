import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    link: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/entitlements", () => ({
  assertCanSaveLink: vi.fn(),
  insertWithinSaveLimit: vi.fn(),
  BillingLimitError: class BillingLimitError extends Error {
    feature = "SAVE_LIMIT";
  },
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn(),
}));

vi.mock("@/lib/folders", () => ({
  assertFolderOwned: vi.fn(),
  FolderNotFoundError: class FolderNotFoundError extends Error {
    readonly name = "FolderNotFoundError";
  },
}));

const { auth } = await import("@/lib/auth");
const { insertWithinSaveLimit } = await import("@/lib/entitlements");
const prisma = (await import("@/lib/prisma")).default;
const { assertFolderOwned, FolderNotFoundError } = await import("@/lib/folders");
const {
  createLinkForUser,
  getLinksPageForCurrentUser,
  LinkNotesError,
  normalizeLinkNotes,
  UnauthorizedError,
  listLinks,
  resolveLinkFromUrl,
  updateLinkForUser,
} = await import("./links");

const MOCK_SESSION = { user: { id: "user-123", username: "user-123" }, session: {} };

function makeRow(
  overrides: Partial<{
    id: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    contentType: "WEB" | "YOUTUBE";
    createdAt: Date;
  }> = {}
) {
  return {
    id: overrides.id ?? "link-1",
    url: "https://example.com",
    title: overrides.title ?? "Example",
    favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    domain: "example.com",
    description: overrides.description ?? null,
    thumbnail: overrides.thumbnail ?? null,
    contentType: overrides.contentType ?? "WEB",
    createdAt: overrides.createdAt ?? new Date("2025-06-15T10:00:00Z"),
  };
}

describe("getLinksPageForCurrentUser", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findMany).mockReset();
  });

  it("returns an empty array when there are no saved links", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    const result = await getLinksPageForCurrentUser(50);

    expect(result).toEqual({ links: [], nextCursor: null, total: undefined });
  });

  it("queries only the authenticated user's links ordered newest-first", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    await getLinksPageForCurrentUser(50);

    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    });
  });

  it("maps a database row to a Link preserving all fields", async () => {
    const row = makeRow();
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([row] as never);

    const { links: result } = await getLinksPageForCurrentUser(50);

    expect(result).toHaveLength(1);
    const link = result[0];
    expect(link.id).toBe(row.id);
    expect(link.url).toBe(row.url);
    expect(link.title).toBe(row.title);
    expect(link.favicon).toBe(row.favicon);
    expect(link.description).toBe(row.description);
    expect(link.thumbnail).toBe(row.thumbnail);
    expect(link.domain).toBe(row.domain);
    expect(link.contentType).toBe(row.contentType);
    expect(link.createdAt).toBe(row.createdAt);
  });

  it("returns multiple links preserving the order returned by the database", async () => {
    const rows = [
      makeRow({ id: "link-2", createdAt: new Date("2025-06-15T12:00:00Z") }),
      makeRow({ id: "link-1", createdAt: new Date("2025-06-15T10:00:00Z") }),
    ];
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue(rows as never);

    const { links: result } = await getLinksPageForCurrentUser(50);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("link-2");
    expect(result[1].id).toBe("link-1");
  });

  it("throws and does not query links when there is no active session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    await expect(getLinksPageForCurrentUser(50)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    expect(vi.mocked(prisma.link.findMany)).not.toHaveBeenCalled();
  });
});

const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com",
  title: "Example",
  description: null,
  favicon: "https://example.com/favicon.ico",
  thumbnail: null,
  domain: "example.com",
  contentType: "WEB" as const,
  createdAt: new Date("2025-01-01T12:00:00.000Z"),
  userId: "user-1",
};

describe("listLinks", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findMany).mockReset();
    vi.mocked(assertFolderOwned).mockReset().mockResolvedValue(undefined);
  });

  it("throws UnauthorizedError when not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(
      listLinks({ limit: 50, cursor: null, contentType: null })
    ).rejects.toThrow("Unauthorized");
  });

  it("returns links with null nextCursor when results fit in one page", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([MOCK_LINK] as never);
    const result = await listLinks({ limit: 50, cursor: null, contentType: null });
    expect(result.links).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when more results exist", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const links = Array.from({ length: 51 }, (_, i) => ({
      ...MOCK_LINK,
      id: `link-${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    vi.mocked(prisma.link.findMany).mockResolvedValue(links as never);
    const result = await listLinks({ limit: 50, cursor: null, contentType: null });
    expect(result.links).toHaveLength(50);
    expect(result.nextCursor).toBe(
      `${result.links[49].createdAt.toISOString()}_link-49`,
    );
  });

  it("passes contentType filter to query", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    await listLinks({ limit: 50, cursor: null, contentType: "YOUTUBE" });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123", contentType: "YOUTUBE" },
      })
    );
  });

  it("continues after a (createdAt, id) cursor so links sharing a timestamp aren't skipped", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    const createdAt = new Date("2025-01-01T12:00:00.000Z");
    await listLinks({
      limit: 50,
      cursor: `${createdAt.toISOString()}_link-7`,
      contentType: null,
    });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-123",
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: "link-7" } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("uses a legacy date-only cursor as lt filter on createdAt", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    const cursor = "2025-01-01T12:00:00.000Z";
    await listLinks({ limit: 50, cursor, contentType: null });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123", createdAt: { lt: new Date(cursor) } },
      })
    );
  });

  it("ignores an invalid cursor string", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    await listLinks({ limit: 50, cursor: "not-a-date", contentType: null });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123" },
      })
    );
  });

  it("puts folderId in the where alongside the keyset OR cursor clause", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    const createdAt = new Date("2025-01-01T12:00:00.000Z");
    await listLinks({
      limit: 50,
      cursor: `${createdAt.toISOString()}_link-7`,
      contentType: null,
      folderId: "folder-1",
    });
    expect(vi.mocked(assertFolderOwned)).toHaveBeenCalledWith(
      "user-123",
      "folder-1",
    );
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-123",
          folderId: "folder-1",
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt, id: { lt: "link-7" } },
          ],
        },
      }),
    );
  });

  it("throws FolderNotFoundError for a foreign folderId and does not query links", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(assertFolderOwned).mockRejectedValue(new FolderNotFoundError());

    await expect(
      listLinks({ limit: 50, cursor: null, contentType: null, folderId: "foreign" }),
    ).rejects.toThrow(FolderNotFoundError);
    expect(vi.mocked(prisma.link.findMany)).not.toHaveBeenCalled();
  });

  it("treats an empty-string folderId as a real filter, not 'no filter' (runs the ownership check)", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(assertFolderOwned).mockRejectedValue(new FolderNotFoundError());

    await expect(
      listLinks({ limit: 50, cursor: null, contentType: null, folderId: "" }),
    ).rejects.toThrow(FolderNotFoundError);
    expect(vi.mocked(assertFolderOwned)).toHaveBeenCalledWith("user-123", "");
    expect(vi.mocked(prisma.link.findMany)).not.toHaveBeenCalled();
  });
});

describe("resolveLinkFromUrl – media links", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;

  /** The HTTP method of every outbound request the lookup made. */
  function methods(): string[] {
    return fetchSpy.mock.calls.map(
      ([, init]) => init?.method ?? "GET",
    );
  }

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("resolves a video URL from its file name without fetching the page", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response("<html><head><title>Page</title></head></html>", {
          headers: { "content-type": "text/html" },
        }),
    );

    const resolved = await resolveLinkFromUrl("https://cdn.test/clip.mov");

    expect(resolved).toMatchObject({
      url: "https://cdn.test/clip.mov",
      domain: "cdn.test",
      contentType: "VIDEO",
      title: "clip",
      description: null,
      thumbnail: null,
      mimeType: null,
    });
    // The extension decides it: no GET (the URL rules need no HEAD either).
    expect(methods().filter((method) => method !== "HEAD")).toEqual([]);
  });

  it("resolves an audio URL from its file name without fetching the page", async () => {
    fetchSpy.mockImplementation(
      async () => new Response(null, { status: 200 }),
    );

    const resolved = await resolveLinkFromUrl(
      "https://cdn.test/podcasts/Episode%2012.mp3",
    );

    expect(resolved).toMatchObject({
      contentType: "AUDIO",
      title: "Episode 12",
      description: null,
      thumbnail: null,
    });
    expect(methods().filter((method) => method !== "HEAD")).toEqual([]);
  });

  it("uses a sniffed image's own URL as its thumbnail, not the page's metadata", async () => {
    const url = "https://cdn.test/asset";
    fetchSpy.mockImplementation(async (_input, init) => {
      if (init?.method === "HEAD") {
        return new Response(null, {
          headers: { "content-type": "image/png" },
        });
      }
      return new Response(
        '<html><head><meta property="og:title" content="A page"></head></html>',
        { headers: { "content-type": "text/html" } },
      );
    });

    const resolved = await resolveLinkFromUrl(url);

    expect(resolved).toMatchObject({
      url,
      domain: "cdn.test",
      contentType: "IMAGE",
      mimeType: "image/png",
      thumbnail: url,
      title: "asset",
      description: null,
    });
  });

  it("records the sniffed MIME type of a web page", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          '<html><head><meta property="og:title" content="A page"></head></html>',
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    );

    const resolved = await resolveLinkFromUrl("https://cdn.test/post");

    expect(resolved).toMatchObject({
      contentType: "WEB",
      mimeType: "text/html",
      title: "A page",
    });
  });
});

describe("normalizeLinkNotes", () => {
  it("returns null for missing or blank notes", () => {
    expect(normalizeLinkNotes(undefined)).toBeNull();
    expect(normalizeLinkNotes(null)).toBeNull();
    expect(normalizeLinkNotes("   \n ")).toBeNull();
  });

  it("trims the ends but keeps inner lines and spacing", () => {
    expect(normalizeLinkNotes("  keep\n\nthese  lines  ")).toBe(
      "keep\n\nthese  lines",
    );
  });

  it("drops control characters but keeps tabs", () => {
    expect(normalizeLinkNotes("a\u0000b\u0007c\td")).toBe("abc\td");
  });

  it("accepts 2,000 characters and refuses 2,001", () => {
    expect(normalizeLinkNotes("x".repeat(2000))).toHaveLength(2000);
    expect(() => normalizeLinkNotes("x".repeat(2001))).toThrow(LinkNotesError);
    expect(() => normalizeLinkNotes("x".repeat(2001))).toThrow(
      "Keep the note to 2,000 characters or fewer.",
    );
  });
});

describe("writing a link's note", () => {
  const EXISTING = {
    id: "link-1",
    userId: "user-123",
    url: "https://example.com/",
    folderId: null,
    fileKey: null,
  };

  describe("updateLinkForUser", () => {
    beforeEach(() => {
      vi.mocked(prisma.link.findFirst).mockReset().mockResolvedValue(EXISTING as never);
      vi.mocked(prisma.link.update).mockReset().mockResolvedValue(EXISTING as never);
    });

    function writtenData() {
      return vi.mocked(prisma.link.update).mock.calls[0][0].data;
    }

    it("writes a trimmed note", async () => {
      await updateLinkForUser("user-123", "link-1", { notes: "  a note " });
      expect(writtenData()).toMatchObject({ notes: "a note" });
    });

    it("clears the note with an empty string", async () => {
      await updateLinkForUser("user-123", "link-1", { notes: "" });
      expect(writtenData()).toMatchObject({ notes: null });
    });

    it("clears the note with null", async () => {
      await updateLinkForUser("user-123", "link-1", { notes: null });
      expect(writtenData()).toMatchObject({ notes: null });
    });

    it("refuses a note over the cap and writes nothing", async () => {
      await expect(
        updateLinkForUser("user-123", "link-1", { notes: "x".repeat(2001) }),
      ).rejects.toThrow(LinkNotesError);
      expect(prisma.link.update).not.toHaveBeenCalled();
    });

    it("writes the note together with a re-scraped url", async () => {
      await updateLinkForUser("user-123", "link-1", {
        url: "https://cdn.test/clip.mov",
        notes: "kept",
      });
      expect(writtenData()).toMatchObject({
        url: "https://cdn.test/clip.mov",
        domain: "cdn.test",
        contentType: "VIDEO",
        notes: "kept",
      });
    });

    it("writes no notes key when notes is omitted", async () => {
      await updateLinkForUser("user-123", "link-1", { title: "t" });
      expect(writtenData()).toEqual({ title: "t" });
      expect(writtenData()).not.toHaveProperty("notes");
    });
  });

  describe("createLinkForUser", () => {
    const create = vi.fn();
    const txFindFirst = vi.fn();

    beforeEach(() => {
      create.mockReset().mockImplementation(async ({ data }) => ({
        id: "new",
        ...data,
      }));
      txFindFirst.mockReset().mockResolvedValue(null);
      vi.mocked(prisma.link.findFirst).mockReset().mockResolvedValue(null);
      vi.mocked(prisma.link.update).mockReset();
      vi.mocked(insertWithinSaveLimit)
        .mockReset()
        .mockImplementation((async (
          _userId: string,
          insert: (tx: unknown) => Promise<unknown>,
          options: { reuse?: (tx: unknown) => Promise<unknown> },
        ) => {
          const tx = { link: { create, findFirst: txFindFirst, update: prisma.link.update } };
          const reused = options.reuse ? await options.reuse(tx) : null;
          return reused ?? insert(tx);
        }) as never);
    });

    it("saves the note on a fresh url", async () => {
      await createLinkForUser("user-123", "https://cdn.test/clip.mov", {
        notes: "first",
      });
      expect(create.mock.calls[0][0].data).toMatchObject({ notes: "first" });
    });

    it("writes no notes key when there is no note", async () => {
      await createLinkForUser("user-123", "https://cdn.test/clip.mov", {
        notes: "   ",
      });
      expect(create.mock.calls[0][0].data).not.toHaveProperty("notes");
    });

    it("refuses a note over the cap before any work", async () => {
      await expect(
        createLinkForUser("user-123", "https://cdn.test/clip.mov", {
          notes: "x".repeat(2001),
        }),
      ).rejects.toThrow(LinkNotesError);
      expect(prisma.link.findFirst).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it("leaves the note alone when the url is already saved", async () => {
      const row = { ...EXISTING, url: "https://cdn.test/clip.mov", notes: "old" };
      txFindFirst.mockResolvedValue(row);
      vi.mocked(prisma.link.update).mockResolvedValue(row as never);

      await createLinkForUser("user-123", "https://cdn.test/clip.mov", {
        notes: "second",
      });

      expect(create).not.toHaveBeenCalled();
      expect(prisma.link.update).toHaveBeenCalledTimes(1);
      expect(vi.mocked(prisma.link.update).mock.calls[0][0].data).not.toHaveProperty(
        "notes",
      );
    });
  });
});
