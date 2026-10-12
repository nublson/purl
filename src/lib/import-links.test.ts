import { beforeEach, describe, expect, it, vi } from "vitest";

// The transaction client has its own mocks, distinct from the global client,
// so the tests prove every query runs on the `tx` the transaction hands over.
const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  link: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  folder: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    $executeRaw: vi.fn(),
    link: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
    folder: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown, _options?: unknown) => cb(tx)),
  };
  return { default: client };
});

vi.mock("@/lib/folders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/folders")>()),
  createFolderInTx: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { createFolderInTx, FolderLimitError, FolderNameError } = await import("@/lib/folders");
const { importLinksForUser } = await import("./import-links");
const { suggestFolderEmoji } = await import("./emoji-suggestion");
const { getDefaultFaviconUrl } = await import("@/utils/default-favicon");
const { MAX_FOLDERS, MAX_FOLDER_NAME_LENGTH } = await import("./limits");

import type { ImportLinkInput } from "./import/types";

const NOW = new Date("2026-10-11T12:00:00.000Z");

function input(overrides: Partial<ImportLinkInput> = {}): ImportLinkInput {
  return {
    url: "https://example.com/a",
    title: "Example",
    folder: null,
    createdAt: "2024-05-01T10:00:00.000Z",
    ...overrides,
  };
}

type WrittenLink = {
  url: string;
  title: string;
  domain: string;
  favicon: string;
  description: null;
  thumbnail: null;
  contentType: string;
  createdAt: Date;
  folderId: string | null;
  userId: string;
  needsMetadata: boolean;
};

function written(): WrittenLink[] {
  expect(tx.link.createMany).toHaveBeenCalledTimes(1);
  return tx.link.createMany.mock.calls[0][0].data as WrittenLink[];
}

let folderSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  folderSeq = 0;
  tx.$executeRaw.mockResolvedValue(1);
  tx.link.count.mockResolvedValue(0);
  tx.link.findMany.mockResolvedValue([]);
  tx.link.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
  tx.folder.findMany.mockResolvedValue([]);
  tx.folder.findFirst.mockResolvedValue(null);
  vi.mocked(createFolderInTx).mockImplementation((async (
    _tx: unknown,
    _userId: string,
    name: string,
  ) => ({ id: `folder-${++folderSeq}`, name })) as never);
});

describe("importLinksForUser", () => {
  it("runs in one transaction and takes the folder lock, then the links lock", async () => {
    await importLinksForUser("user-1", [input({ folder: "Dev" })], NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    // Tagged template calls: (strings, ...values).
    const [first, second] = tx.$executeRaw.mock.calls;
    expect(first.slice(1)).toEqual(["user-1"]);
    expect(second.slice(1)).toEqual(["links:user-1"]);
    expect((first[0] as TemplateStringsArray).join("?")).toContain("pg_advisory_xact_lock(hashtext(?))");
    expect((second[0] as TemplateStringsArray).join("?")).toContain("pg_advisory_xact_lock(hashtext(?))");
    // Locks come before any read.
    const lockOrder = tx.$executeRaw.mock.invocationCallOrder[1];
    expect(lockOrder).toBeLessThan(tx.link.count.mock.invocationCallOrder[0]);
    expect(lockOrder).toBeLessThan(tx.link.findMany.mock.invocationCallOrder[0]);
    expect(lockOrder).toBeLessThan(tx.folder.findMany.mock.invocationCallOrder[0]);
    // Nothing touches the global client outside the transaction.
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.link.createMany).not.toHaveBeenCalled();
    expect(prisma.link.findMany).not.toHaveBeenCalled();
  });

  it("gives the transaction room for a folder-heavy chunk, past Prisma's 5 s default", async () => {
    await importLinksForUser("user-1", [input()], NOW);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
      maxWait: 10_000,
    });
  });

  it("writes a valid link with every field, flagged for metadata", async () => {
    const result = await importLinksForUser(
      "user-1",
      [
        input({
          url: "  https://www.example.com/report.pdf  ",
          title: "  The report  ",
          createdAt: "2024-05-01T10:00:00.000Z",
        }),
      ],
      NOW,
    );

    expect(written()).toEqual([
      {
        url: "https://www.example.com/report.pdf",
        title: "The report",
        domain: "example.com",
        favicon: getDefaultFaviconUrl("example.com"),
        description: null,
        thumbnail: null,
        contentType: "PDF",
        createdAt: new Date("2024-05-01T10:00:00.000Z"),
        folderId: null,
        userId: "user-1",
        needsMetadata: true,
      },
    ]);
    expect(result).toEqual({
      imported: 1,
      duplicates: 0,
      invalid: 0,
      overLimit: 0,
      foldersCreated: 0,
      unfiledForFolderLimit: 0,
      limitReached: false,
    });
  });

  it("counts duplicates of existing links and of earlier links in the chunk", async () => {
    tx.link.count.mockResolvedValue(2);
    tx.link.findMany.mockResolvedValue([
      { url: "https://example.com/a" },
      { url: "https://Blog.example.org/post/" },
    ]);

    const result = await importLinksForUser(
      "user-1",
      [
        input({ url: "https://www.example.com/a" }), // www of an existing link
        input({ url: "https://blog.example.org/post" }), // case + trailing slash
        input({ url: "https://new.example.net/x/" }),
        input({ url: "http://www.NEW.example.net/x" }), // same as the previous one
      ],
      NOW,
    );

    expect(tx.link.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { url: true },
    });
    expect(written().map((l) => l.url)).toEqual(["https://new.example.net/x/"]);
    expect(result.duplicates).toBe(3);
    expect(result.imported).toBe(1);
    // Existing links are never modified: `tx.link` has no update methods, so
    // any attempt would throw; the only write is the one createMany.
    expect(tx.link.createMany).toHaveBeenCalledTimes(1);
  });

  it("imports up to the cap in chunk order and counts the rest as over the limit", async () => {
    tx.link.count.mockResolvedValue(998);

    const urls = [1, 2, 3, 4, 5].map((n) => `https://example.com/${n}`);
    const result = await importLinksForUser(
      "user-1",
      urls.map((url) => input({ url })),
      NOW,
    );

    expect(tx.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(written().map((l) => l.url)).toEqual(urls.slice(0, 2));
    expect(result).toMatchObject({ imported: 2, overLimit: 3, limitReached: true });
  });

  it("counts invalid links without throwing", async () => {
    const result = await importLinksForUser(
      "user-1",
      [
        input({ url: "javascript:x" }),
        input({ url: "" }),
        input({ url: `https://example.com/${"a".repeat(2049 - "https://example.com/".length)}` }),
        input({ url: "not a url" }),
        input({ url: "https://example.com/ok" }),
      ],
      NOW,
    );

    expect(result).toMatchObject({ invalid: 4, imported: 1, duplicates: 0 });
    expect(written().map((l) => l.url)).toEqual(["https://example.com/ok"]);
  });

  it("accepts a URL of exactly 2,048 characters", async () => {
    const url = `https://example.com/${"a".repeat(2048 - "https://example.com/".length)}`;
    expect(url).toHaveLength(2048);
    const result = await importLinksForUser("user-1", [input({ url })], NOW);
    expect(result).toMatchObject({ invalid: 0, imported: 1 });
  });

  it("cuts long titles, falls back to the domain and replaces implausible dates with now", async () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    await importLinksForUser(
      "user-1",
      [
        input({ url: "https://example.com/1", title: "x".repeat(600) }),
        input({ url: "https://www.example.com/2", title: "   " }),
        input({ url: "https://example.com/3", createdAt: "not a date" }),
        input({ url: "https://example.com/4", createdAt: "1999-12-31" }),
        input({ url: "https://example.com/5", createdAt: future }),
        input({ url: "https://example.com/6", createdAt: null }),
      ],
      NOW,
    );

    const links = written();
    expect(links[0].title).toBe("x".repeat(500));
    expect(links[1].title).toBe("example.com");
    expect(links.slice(2).map((l) => l.createdAt)).toEqual([NOW, NOW, NOW, NOW]);
    expect(links[0].createdAt).toEqual(new Date("2024-05-01T10:00:00.000Z"));
  });

  it("does not split a surrogate pair when cutting a title", async () => {
    const title = `${"x".repeat(499)}😀tail`;
    await importLinksForUser("user-1", [input({ title })], NOW);
    expect(written()[0].title).toBe("x".repeat(499));
  });

  describe("folders", () => {
    it("matches an existing folder case- and space-insensitively", async () => {
      tx.folder.findMany.mockResolvedValue([{ id: "existing-1", name: "Reading list" }]);

      const result = await importLinksForUser(
        "user-1",
        [input({ folder: "reading LIST " })],
        NOW,
      );

      expect(tx.folder.findMany).toHaveBeenCalledTimes(1);
      expect(tx.folder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
      expect(createFolderInTx).not.toHaveBeenCalled();
      expect(written()[0].folderId).toBe("existing-1");
      expect(result.foldersCreated).toBe(0);
    });

    it("creates a missing folder on the transaction with its suggested emoji", async () => {
      const result = await importLinksForUser(
        "user-1",
        [input({ folder: "Dev / Tools" })],
        NOW,
      );

      expect(createFolderInTx).toHaveBeenCalledTimes(1);
      expect(createFolderInTx).toHaveBeenCalledWith(
        tx,
        "user-1",
        "Dev / Tools",
        suggestFolderEmoji("Dev / Tools"),
      );
      expect(written()[0].folderId).toBe("folder-1");
      expect(result.foldersCreated).toBe(1);
    });

    it("creates one folder for names equal ignoring case and spaces in a chunk", async () => {
      const result = await importLinksForUser(
        "user-1",
        [
          input({ url: "https://example.com/1", folder: "Dev" }),
          input({ url: "https://example.com/2", folder: " dev " }),
          input({ url: "https://example.com/3", folder: "   " }),
        ],
        NOW,
      );

      expect(createFolderInTx).toHaveBeenCalledTimes(1);
      expect(vi.mocked(createFolderInTx).mock.calls[0][2]).toBe("Dev");
      expect(written().map((l) => l.folderId)).toEqual(["folder-1", "folder-1", null]);
      expect(result).toMatchObject({ foldersCreated: 1, unfiledForFolderLimit: 0 });
    });

    it("writes links unfiled when the account is at the folder cap", async () => {
      tx.folder.findMany.mockResolvedValue(
        Array.from({ length: MAX_FOLDERS }, (_, i) => ({ id: `f-${i}`, name: `Folder ${i}` })),
      );

      const result = await importLinksForUser(
        "user-1",
        [
          input({ url: "https://example.com/1", folder: "New one" }),
          input({ url: "https://example.com/2", folder: "new ONE" }),
          input({ url: "https://example.com/3", folder: "Folder 7" }),
          input({ url: "https://example.com/4", folder: null }),
        ],
        NOW,
      );

      expect(createFolderInTx).not.toHaveBeenCalled();
      expect(written().map((l) => l.folderId)).toEqual([null, null, "f-7", null]);
      expect(result).toMatchObject({ imported: 4, foldersCreated: 0, unfiledForFolderLimit: 2 });
    });

    it("stops creating folders once the cap is reached mid-chunk", async () => {
      tx.folder.findMany.mockResolvedValue(
        Array.from({ length: MAX_FOLDERS - 1 }, (_, i) => ({ id: `f-${i}`, name: `Folder ${i}` })),
      );

      const result = await importLinksForUser(
        "user-1",
        [
          input({ url: "https://example.com/1", folder: "First new" }),
          input({ url: "https://example.com/2", folder: "Second new" }),
        ],
        NOW,
      );

      expect(createFolderInTx).toHaveBeenCalledTimes(1);
      expect(written().map((l) => l.folderId)).toEqual(["folder-1", null]);
      expect(result).toMatchObject({ foldersCreated: 1, unfiledForFolderLimit: 1 });
    });

    it("shortens a long folder name before creating it", async () => {
      const name = `${"a".repeat(58)}🦪${"b".repeat(10)}`;
      expect(name).toHaveLength(70);

      const result = await importLinksForUser("user-1", [input({ folder: name })], NOW);

      expect(createFolderInTx).toHaveBeenCalledTimes(1);
      const created = vi.mocked(createFolderInTx).mock.calls[0][2];
      expect(created.length).toBeLessThanOrEqual(MAX_FOLDER_NAME_LENGTH);
      expect(created.endsWith("…")).toBe(true);
      // No lone surrogate left behind by the cut.
      expect(created).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(result.foldersCreated).toBe(1);
    });

    it("uses the folder the database matched when creating reports the name taken", async () => {
      vi.mocked(createFolderInTx).mockRejectedValue(
        new FolderNameError("taken", "You already have a folder with that name. Choose another."),
      );
      tx.folder.findFirst.mockResolvedValue({ id: "db-match" });

      const result = await importLinksForUser(
        "user-1",
        [
          input({ url: "https://example.com/1", folder: "İstanbul" }),
          input({ url: "https://example.com/2", folder: "i̇stanbul" }),
        ],
        NOW,
      );

      expect(tx.folder.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", name: { equals: "İstanbul", mode: "insensitive" } },
        select: { id: true },
      });
      expect(written().map((l) => l.folderId)).toEqual(["db-match", "db-match"]);
      expect(result).toMatchObject({ imported: 2, foldersCreated: 0, unfiledForFolderLimit: 0 });
    });

    it("writes links unfiled when the name is taken but no folder is found", async () => {
      vi.mocked(createFolderInTx).mockRejectedValue(
        new FolderNameError("taken", "You already have a folder with that name. Choose another."),
      );

      const result = await importLinksForUser(
        "user-1",
        [
          input({ url: "https://example.com/1", folder: "50%_off" }),
          input({ url: "https://example.com/2", folder: "50%_OFF" }),
        ],
        NOW,
      );

      expect(createFolderInTx).toHaveBeenCalledTimes(1);
      expect(written().map((l) => l.folderId)).toEqual([null, null]);
      expect(result).toMatchObject({ imported: 2, foldersCreated: 0, unfiledForFolderLimit: 2 });
    });

    it("writes links unfiled when creating hits the folder cap", async () => {
      vi.mocked(createFolderInTx).mockRejectedValue(
        new FolderLimitError("You can have up to 100 folders."),
      );

      const result = await importLinksForUser("user-1", [input({ folder: "New" })], NOW);

      expect(tx.folder.findFirst).not.toHaveBeenCalled();
      expect(written()[0].folderId).toBeNull();
      expect(result).toMatchObject({ imported: 1, foldersCreated: 0, unfiledForFolderLimit: 1 });
    });

    it("rethrows other folder errors", async () => {
      vi.mocked(createFolderInTx).mockRejectedValue(new Error("connection lost"));

      await expect(
        importLinksForUser("user-1", [input({ folder: "New" })], NOW),
      ).rejects.toThrow("connection lost");
    });

    it("does not create folders for links that are over the limit", async () => {
      tx.link.count.mockResolvedValue(999);

      const result = await importLinksForUser(
        "user-1",
        [
          input({ url: "https://example.com/1", folder: "Kept" }),
          input({ url: "https://example.com/2", folder: "Dropped" }),
        ],
        NOW,
      );

      expect(createFolderInTx).toHaveBeenCalledTimes(1);
      expect(vi.mocked(createFolderInTx).mock.calls[0][2]).toBe("Kept");
      expect(result).toMatchObject({ imported: 1, overLimit: 1, foldersCreated: 1 });
    });
  });

  it("strips NUL characters from titles and folder names and rejects URLs with one", async () => {
    const result = await importLinksForUser(
      "user-1",
      [
        input({ url: "https://example.com/1", title: "Ti\u0000tle", folder: "De\u0000v" }),
        input({ url: "https://example.com/2", folder: "\u0000\u0000" }),
        input({ url: "https://example.com/3\u0000x" }),
      ],
      NOW,
    );

    expect(createFolderInTx).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createFolderInTx).mock.calls[0][2]).toBe("Dev");
    const links = written();
    expect(links.map((l) => l.title)).toEqual(["Title", "Example"]);
    expect(links.map((l) => l.folderId)).toEqual(["folder-1", null]);
    expect(JSON.stringify(links)).not.toContain("\\u0000");
    expect(result).toMatchObject({ imported: 2, invalid: 1, unfiledForFolderLimit: 0 });
  });

  it("does not write anything when every link is a duplicate or invalid", async () => {
    tx.link.count.mockResolvedValue(1);
    tx.link.findMany.mockResolvedValue([{ url: "https://example.com/a" }]);

    const result = await importLinksForUser(
      "user-1",
      [input({ url: "https://www.example.com/a/", folder: "New" }), input({ url: "ftp://x" })],
      NOW,
    );

    expect(tx.link.createMany).not.toHaveBeenCalled();
    expect(createFolderInTx).not.toHaveBeenCalled();
    expect(result).toEqual({
      imported: 0,
      duplicates: 1,
      invalid: 1,
      overLimit: 0,
      foldersCreated: 0,
      unfiledForFolderLimit: 0,
      limitReached: false,
    });
  });

  it("does not write anything when the account is already full", async () => {
    tx.link.count.mockResolvedValue(1000);

    const result = await importLinksForUser("user-1", [input()], NOW);

    expect(tx.link.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ imported: 0, overLimit: 1, limitReached: true });
  });
});
