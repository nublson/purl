import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    folder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    link: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const {
  slugifyFolderName,
  FolderNotFoundError,
  FolderNameError,
  FolderLimitError,
  listFoldersForUser,
  getFolderBySlug,
  createFolder,
  renameFolder,
  deleteFolder,
  assertFolderOwned,
} = await import("./folders");
const { MAX_FOLDERS } = await import("./limits");

function resetMocks() {
  vi.mocked(prisma.folder.findMany).mockReset();
  vi.mocked(prisma.folder.findFirst).mockReset();
  vi.mocked(prisma.folder.count).mockReset();
  vi.mocked(prisma.folder.create).mockReset();
  vi.mocked(prisma.folder.update).mockReset();
  vi.mocked(prisma.folder.delete).mockReset();
  vi.mocked(prisma.link.deleteMany).mockReset();
  vi.mocked(prisma.$transaction).mockReset();
}

describe("slugifyFolderName", () => {
  it.each([
    ["Books", "books"],
    ["Café & Crème", "cafe-creme"],
    ["  Trip   to  Japan ", "trip-to-japan"],
    ["🍣", "folder"],
    ["a".repeat(80), "a".repeat(50)],
  ])("slugifyFolderName(%j) → %j", (name, expected) => {
    expect(slugifyFolderName(name)).toBe(expected);
  });
});

describe("createFolder", () => {
  beforeEach(resetMocks);

  it("rejects blank names", async () => {
    const err = await createFolder("user-1", "   ").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FolderNameError);
    expect((err as InstanceType<typeof FolderNameError>).reason).toBe("empty");
    expect((err as Error).message).toBe("Give your folder a name.");
    expect(prisma.folder.count).not.toHaveBeenCalled();
  });

  it("rejects names over 60 characters", async () => {
    const err = await createFolder("user-1", "a".repeat(61)).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNameError);
    expect((err as InstanceType<typeof FolderNameError>).reason).toBe(
      "too_long",
    );
    expect((err as Error).message).toBe("Keep it under 60 characters.");
  });

  it("rejects case-insensitive duplicates", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(1);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "existing-id",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);

    const err = await createFolder("user-1", "books").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNameError);
    expect((err as InstanceType<typeof FolderNameError>).reason).toBe(
      "taken",
    );
    expect((err as Error).message).toBe(
      "You already have a folder with that name.",
    );
    expect(prisma.folder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          name: { equals: "books", mode: "insensitive" },
        }),
      }),
    );
  });

  it("enforces the cap", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(MAX_FOLDERS);

    const err = await createFolder("user-1", "New Folder").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderLimitError);
    expect((err as InstanceType<typeof FolderLimitError>).feature).toBe(
      "FOLDER_LIMIT",
    );
    expect((err as Error).message).toBe("You can have up to 100 folders.");
    expect(prisma.folder.findFirst).not.toHaveBeenCalled();
  });

  it("suffixes colliding slugs", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(2);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { slug: "books" },
      { slug: "books-2" },
    ] as never);
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: "new-id",
      name: "Books!",
      slug: "books-3",
      _count: { links: 0 },
    } as never);

    const result = await createFolder("user-1", "Books!");
    expect(result).toEqual({
      id: "new-id",
      name: "Books!",
      slug: "books-3",
      linkCount: 0,
    });
    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          name: "Books!",
          slug: "books-3",
        }),
      }),
    );
  });

  it("maps a P2002 race on create to a taken FolderNameError", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(0);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.create).mockRejectedValue({ code: "P2002" });

    const err = await createFolder("user-1", "Books").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNameError);
    expect((err as InstanceType<typeof FolderNameError>).reason).toBe(
      "taken",
    );
  });
});

describe("renameFolder", () => {
  beforeEach(resetMocks);

  it("treats another user's folder as not found", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);

    const err = await renameFolder("user-1", "folder-1", "New Name").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNotFoundError);
    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", userId: "user-1" },
    });
  });

  it("allows renaming to the same name in another case", async () => {
    vi.mocked(prisma.folder.findFirst)
      // ownership check
      .mockResolvedValueOnce({
        id: "folder-1",
        name: "Books",
        slug: "books",
        userId: "user-1",
      } as never)
      // taken check, excludes own id, so no match
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "books",
      slug: "books",
      _count: { links: 3 },
    } as never);

    const result = await renameFolder("user-1", "folder-1", "books");
    expect(result).toEqual({
      id: "folder-1",
      name: "books",
      slug: "books",
      linkCount: 3,
    });
    expect(prisma.folder.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        name: { equals: "books", mode: "insensitive" },
        NOT: { id: "folder-1" },
      },
    });
  });

  it("regenerates and de-collides the slug on rename", async () => {
    vi.mocked(prisma.folder.findFirst)
      .mockResolvedValueOnce({
        id: "folder-1",
        name: "Books",
        slug: "books",
        userId: "user-1",
      } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { slug: "trips" },
    ] as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Trips",
      slug: "trips-2",
      _count: { links: 1 },
    } as never);

    const result = await renameFolder("user-1", "folder-1", "Trips");
    expect(result.slug).toBe("trips-2");
    expect(prisma.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          NOT: { id: "folder-1" },
        }),
      }),
    );
    expect(prisma.folder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "folder-1" },
        data: expect.objectContaining({ name: "Trips", slug: "trips-2" }),
      }),
    );
  });

  it("maps a P2002 race on rename to a taken FolderNameError", async () => {
    vi.mocked(prisma.folder.findFirst)
      .mockResolvedValueOnce({
        id: "folder-1",
        name: "Books",
        slug: "books",
        userId: "user-1",
      } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.update).mockRejectedValue({ code: "P2002" });

    const err = await renameFolder("user-1", "folder-1", "Trips").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNameError);
    expect((err as InstanceType<typeof FolderNameError>).reason).toBe(
      "taken",
    );
  });
});

describe("deleteFolder", () => {
  beforeEach(resetMocks);

  it("treats another user's folder as not found", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);

    const err = await deleteFolder("user-1", "folder-1", {
      withLinks: false,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FolderNotFoundError);
  });

  it("deletes only this folder's links when withLinks", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 5 }, {}]);

    const result = await deleteFolder("user-1", "folder-1", {
      withLinks: true,
    });
    expect(result).toEqual({ deletedLinks: 5 });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      prisma.link.deleteMany({
        where: { userId: "user-1", folderId: "folder-1" },
      }),
      prisma.folder.delete({ where: { id: "folder-1" } }),
    ]);
  });

  it("keeps links when not withLinks", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.folder.delete).mockResolvedValue({} as never);

    const result = await deleteFolder("user-1", "folder-1", {
      withLinks: false,
    });
    expect(result).toEqual({ deletedLinks: 0 });
    expect(prisma.folder.delete).toHaveBeenCalledWith({
      where: { id: "folder-1" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("assertFolderOwned", () => {
  beforeEach(resetMocks);

  it("resolves when the folder belongs to the user", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "folder-1",
      userId: "user-1",
    } as never);
    await expect(
      assertFolderOwned("user-1", "folder-1"),
    ).resolves.toBeUndefined();
  });

  it("throws FolderNotFoundError for another user's folder", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    await expect(
      assertFolderOwned("user-1", "folder-1"),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});

describe("listFoldersForUser", () => {
  beforeEach(resetMocks);

  it("orders by name, case-insensitive", async () => {
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { id: "1", name: "banana", slug: "banana", _count: { links: 0 } },
      { id: "2", name: "Apple", slug: "apple", _count: { links: 2 } },
      { id: "3", name: "cherry", slug: "cherry", _count: { links: 1 } },
    ] as never);

    const result = await listFoldersForUser("user-1");
    expect(result.map((f) => f.name)).toEqual(["Apple", "banana", "cherry"]);
    expect(result[1]).toEqual({
      id: "1",
      name: "banana",
      slug: "banana",
      linkCount: 0,
    });
  });
});

describe("getFolderBySlug", () => {
  beforeEach(resetMocks);

  it("returns null when not found", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    const result = await getFolderBySlug("user-1", "missing");
    expect(result).toBeNull();
  });

  it("returns the folder summary when found", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "1",
      name: "Books",
      slug: "books",
      _count: { links: 4 },
    } as never);
    const result = await getFolderBySlug("user-1", "books");
    expect(result).toEqual({
      id: "1",
      name: "Books",
      slug: "books",
      linkCount: 4,
    });
  });
});
