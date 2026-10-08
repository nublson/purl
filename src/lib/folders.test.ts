import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    folder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    link: {
      deleteMany: vi.fn(),
    },
    folderSlugRedirect: {
      upsert: vi.fn(),
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
  updateFolder,
  deleteFolder,
  normalizeFolderEmoji,
  FolderEmojiError,
  normalizeFolderDescription,
  FolderDescriptionError,
  MAX_FOLDER_DESCRIPTION_LENGTH,
  FolderUpdateEmptyError,
  DEFAULT_FOLDER_EMOJI,
  assertFolderOwned,
  reorderFolders,
  InvalidFolderOrderError,
} = await import("./folders");
const { MAX_FOLDERS } = await import("./limits");

/**
 * Stand-in for the interactive-transaction client `createFolder` receives.
 * It shares the root `prisma.folder` mocks so per-test setups apply to both,
 * plus its own `$executeRaw` (the per-user advisory lock).
 */
const txExecuteRaw = vi.fn();
const tx = {
  folder: prisma.folder,
  folderSlugRedirect: prisma.folderSlugRedirect,
  $executeRaw: txExecuteRaw,
};

function resetMocks() {
  txExecuteRaw.mockReset().mockResolvedValue(1);
  vi.mocked(prisma.folder.findMany).mockReset();
  vi.mocked(prisma.folder.findFirst).mockReset();
  vi.mocked(prisma.folder.count).mockReset();
  vi.mocked(prisma.folder.aggregate)
    .mockReset()
    .mockResolvedValue({ _max: { position: null } } as never);
  vi.mocked(prisma.folder.create).mockReset();
  vi.mocked(prisma.folder.update).mockReset();
  vi.mocked(prisma.folder.delete).mockReset();
  vi.mocked(prisma.link.deleteMany).mockReset();
  vi.mocked(prisma.folderSlugRedirect.upsert).mockReset();
  vi.mocked(prisma.$transaction)
    .mockReset()
    // Interactive form: run the callback against `tx`. (deleteFolder's tests
    // override this with the array form's resolved value.)
    .mockImplementation(((arg: unknown) =>
      typeof arg === "function" ? arg(tx) : Promise.resolve(arg)) as never);
}

describe("slugifyFolderName", () => {
  it.each([
    ["Books", "books"],
    ["Café & Crème", "cafe-creme"],
    ["  Trip   to  Japan ", "trip-to-japan"],
    ["🍣", "folder"],
    ["a".repeat(80), "a".repeat(50)],
    // The 50-char cut lands right after the separator: no trailing "-".
    [`${"a".repeat(49)} more text`, "a".repeat(49)],
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
    expect((err as Error).message).toBe("Keep the name to 60 characters or fewer.");
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
      "You already have a folder with that name. Choose another.",
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
      emoji: DEFAULT_FOLDER_EMOJI,
      description: null,
      isPublic: false,
      position: 0,
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

  it("strips a trailing dash off a truncated base before adding a collision suffix", async () => {
    // Slugifies to 47 a's + "-" + "bb" (50 chars, the truncation cutoff).
    // Suffixing "-2" (48-char budget) would otherwise truncate right after
    // the dash, producing a "...a--2" double-dash if the trailing dash isn't
    // stripped first.
    const name = `${"a".repeat(47)} ${"b".repeat(10)}`;
    const base = `${"a".repeat(47)}-bb`;
    vi.mocked(prisma.folder.count).mockResolvedValue(1);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { slug: base },
    ] as never);
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: "new-id",
      name,
      slug: `${"a".repeat(47)}-2`,
      _count: { links: 0 },
    } as never);

    await createFolder("user-1", name);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: `${"a".repeat(47)}-2` }),
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

  it("takes the per-user lock before counting, and creates on the transaction client", async () => {
    // Distinct tx mocks so the test proves the reads and the insert run on
    // `tx`, not the root client, and in lock → count → create order.
    const order: string[] = [];
    const isolatedTx = {
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        order.push(`lock:${strings.join("?")}:${values.join(",")}`);
        return 1;
      }),
      folder: {
        count: vi.fn(async () => {
          order.push("count");
          return MAX_FOLDERS - 1;
        }),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _max: { position: null } })),
        create: vi.fn(async () => {
          order.push("create");
          return { id: "new-id", name: "Books", slug: "books", position: 1, _count: { links: 0 } };
        }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((
      cb: (t: typeof isolatedTx) => unknown,
    ) => cb(isolatedTx)) as never);

    const result = await createFolder("user-1", "Books");

    expect(result).toEqual({
      id: "new-id",
      name: "Books",
      slug: "books",
      emoji: DEFAULT_FOLDER_EMOJI,
      description: null,
      isPublic: false,
      position: 1,
      linkCount: 0,
    });
    expect(order).toEqual([
      "lock:SELECT pg_advisory_xact_lock(hashtext(?)):user-1",
      "count",
      "create",
    ]);
    expect(isolatedTx.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: "user-1",
          name: "Books",
          slug: "books",
          emoji: null,
          description: null,
          position: 1,
        },
      }),
    );
    expect(prisma.folder.count).not.toHaveBeenCalled();
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  it("does not create when the locked count is already at the cap", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(MAX_FOLDERS);

    const err = await createFolder("user-1", "Late").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(FolderLimitError);
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });
});

describe("createFolder position", () => {
  beforeEach(resetMocks);

  it("puts a new folder after the last one", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(3);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.aggregate).mockResolvedValue({
      _max: { position: 7 },
    } as never);
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: "f",
      name: "Books",
      slug: "books",
      position: 8,
      _count: { links: 0 },
    } as never);

    await createFolder("user-1", "Books");

    expect(prisma.folder.aggregate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      _max: { position: true },
    });
    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 8 }),
      }),
    );
  });

  it("starts a first folder at 1", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(0);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: "f",
      name: "Books",
      slug: "books",
      position: 1,
      _count: { links: 0 },
    } as never);

    await createFolder("user-1", "Books");

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 1 }),
      }),
    );
  });
});

describe("listFoldersForUser", () => {
  beforeEach(resetMocks);

  it("orders by position then name in the database", async () => {
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { id: "z", name: "Zeta", slug: "zeta", position: 1, _count: { links: 0 } },
      { id: "a", name: "alpha", slug: "alpha", position: 2, _count: { links: 2 } },
    ] as never);

    const folders = await listFoldersForUser("user-1");

    expect(prisma.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
    );
    expect(folders.map((f) => [f.name, f.position])).toEqual([
      ["Zeta", 1],
      ["alpha", 2],
    ]);
  });
});

describe("reorderFolders", () => {
  beforeEach(() => {
    resetMocks();
    // First call: the ownership check inside the transaction (ids only).
    // Later calls: listFoldersForUser after it.
    vi.mocked(prisma.folder.findMany)
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }] as never)
      .mockResolvedValue([
        { id: "c", name: "C", slug: "c", position: 1, _count: { links: 0 } },
        { id: "a", name: "A", slug: "a", position: 2, _count: { links: 0 } },
        { id: "b", name: "B", slug: "b", position: 3, _count: { links: 0 } },
      ] as never);
  });

  it("writes index + 1 to every folder and returns the new order", async () => {
    const result = await reorderFolders("user-1", ["c", "a", "b"]);

    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(prisma.folder.update).toHaveBeenCalledTimes(3);
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: "c" },
      data: { position: 1 },
    });
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { position: 2 },
    });
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { position: 3 },
    });
    expect(result.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });

  it.each([
    ["a missing id", ["a", "b"]],
    ["an extra id", ["a", "b", "c", "x"]],
    ["a duplicate id", ["a", "a", "b", "c"]],
    ["another user's id", ["a", "b", "x"]],
  ])("rejects %s", async (_label, ids) => {
    await expect(reorderFolders("user-1", ids)).rejects.toBeInstanceOf(
      InvalidFolderOrderError,
    );
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });

  it("accepts an empty list for a user with no folders", async () => {
    vi.mocked(prisma.folder.findMany).mockReset().mockResolvedValue([]);

    await expect(reorderFolders("user-1", [])).resolves.toEqual([]);
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });
});

describe("updateFolder", () => {
  beforeEach(resetMocks);

  it("treats another user's folder as not found", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);

    const err = await updateFolder("user-1", "folder-1", { name: "New Name" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNotFoundError);
    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", userId: "user-1" },
      select: { slug: true },
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

    const result = await updateFolder("user-1", "folder-1", { name: "books" });
    expect(result).toEqual({
      id: "folder-1",
      name: "books",
      slug: "books",
      emoji: DEFAULT_FOLDER_EMOJI,
      description: null,
      isPublic: false,
      position: 0,
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

  it("keeps the old slug as a redirect when a rename changes it", async () => {
    vi.mocked(prisma.folder.findFirst)
      .mockResolvedValueOnce({ slug: "books" } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Trips",
      slug: "trips",
      _count: { links: 0 },
    } as never);

    await updateFolder("user-1", "folder-1", { name: "Trips" });
    expect(prisma.folderSlugRedirect.upsert).toHaveBeenCalledWith({
      where: { userId_slug: { userId: "user-1", slug: "books" } },
      create: { userId: "user-1", slug: "books", folderId: "folder-1" },
      update: { folderId: "folder-1" },
    });
  });

  it("makes a folder public on its own, without touching the slug", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValueOnce({ slug: "books" } as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      isPublic: true,
      _count: { links: 2 },
    } as never);

    const result = await updateFolder("user-1", "folder-1", { isPublic: true });
    expect(result.isPublic).toBe(true);
    expect(prisma.folder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPublic: true } }),
    );
    expect(prisma.folderSlugRedirect.upsert).not.toHaveBeenCalled();
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

    const result = await updateFolder("user-1", "folder-1", { name: "Trips" });
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

    const err = await updateFolder("user-1", "folder-1", { name: "Trips" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderNameError);
    expect((err as InstanceType<typeof FolderNameError>).reason).toBe(
      "taken",
    );
  });
  it("rejects an update with no fields before touching the DB", async () => {
    const err = await updateFolder("user-1", "folder-1", {}).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderUpdateEmptyError);
    expect((err as Error).message).toBe("Nothing to update");
    expect(prisma.folder.findFirst).not.toHaveBeenCalled();
  });

  it("updates only the emoji, leaving the name and slug alone", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValueOnce({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      emoji: "📚",
      _count: { links: 2 },
    } as never);

    const result = await updateFolder("user-1", "folder-1", { emoji: " 📚 " });

    expect(result).toEqual({
      id: "folder-1",
      name: "Books",
      slug: "books",
      emoji: "📚",
      description: null,
      isPublic: false,
      position: 0,
      linkCount: 2,
    });
    expect(prisma.folder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "folder-1" }, data: { emoji: "📚" } }),
    );
    // No name → no taken check and no slug regeneration.
    expect(prisma.folder.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.folder.findMany).not.toHaveBeenCalled();
  });

  it("clears the emoji with null or an empty string", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      emoji: null,
      _count: { links: 0 },
    } as never);

    const a = await updateFolder("user-1", "folder-1", { emoji: null });
    const b = await updateFolder("user-1", "folder-1", { emoji: "" });

    expect(a.emoji).toBe(DEFAULT_FOLDER_EMOJI);
    expect(b.emoji).toBe(DEFAULT_FOLDER_EMOJI);
    expect(prisma.folder.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { emoji: null } }),
    );
    expect(prisma.folder.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { emoji: null } }),
    );
  });

  it("updates name and emoji together", async () => {
    vi.mocked(prisma.folder.findFirst)
      .mockResolvedValueOnce({
        id: "folder-1",
        name: "Books",
        slug: "books",
        userId: "user-1",
      } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Trips",
      slug: "trips",
      emoji: "✈️",
      _count: { links: 0 },
    } as never);

    await updateFolder("user-1", "folder-1", { name: "Trips", emoji: "✈️" });

    expect(prisma.folder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Trips", slug: "trips", emoji: "✈️" },
      }),
    );
  });

  it("rejects an invalid emoji without updating", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);

    const err = await updateFolder("user-1", "folder-1", {
      emoji: "📚📚",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(FolderEmojiError);
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });
});

describe("normalizeFolderEmoji", () => {
  it.each([
    ["🦪", "🦪"],
    ["  📚  ", "📚"],
    // ZWJ sequence: one grapheme, several code points.
    ["👩‍💻", "👩‍💻"],
    // Flag: a pair of regional indicators.
    ["🇵🇹", "🇵🇹"],
    // Skin-tone modifier and variation selector.
    ["👍🏽", "👍🏽"],
    // Toned emoji from the picker's skin tones: ZWJ sequences with modifiers.
    ["🧑🏿‍🎨", "🧑🏿‍🎨"],
    ["🫱🏼‍🫲🏿", "🫱🏼‍🫲🏿"],
    ["✈️", "✈️"],
    // Keycap sequence.
    ["1️⃣", "1️⃣"],
    // Text-default pictograph forced to emoji presentation with U+FE0F.
    ["\u2764\uFE0F", "\u2764\uFE0F"],
    ["\u00A9\uFE0F", "\u00A9\uFE0F"],
    // Typical emoji-picker output: skin-tone ZWJ sequences, flags with ZWJ.
    ["👩🏽‍💻", "👩🏽‍💻"],
    ["🧑🏿‍🤝‍🧑🏻", "🧑🏿‍🤝‍🧑🏻"],
    ["🏳️‍🌈", "🏳️‍🌈"],
    ["☺️", "☺️"],
  ])("accepts %j", (input, expected) => {
    expect(normalizeFolderEmoji(input)).toBe(expected);
  });

  it.each([[undefined], [null], [""], ["   "]])(
    "treats %j as no emoji (null)",
    (input) => {
      expect(normalizeFolderEmoji(input)).toBeNull();
    },
  );

  it.each([
    ["two emoji", "📚📚"],
    ["two flags", "🇵🇹🇧🇷"],
    ["plain text", "a"],
    ["a word", "books"],
    ["emoji plus text", "📚a"],
    ["a digit alone", "1"],
    ["a letter with U+FE0F", "a\uFE0F"],
    ["© (text presentation)", "\u00A9"],
    ["® (text presentation)", "\u00AE"],
    ["™ (text presentation)", "\u2122"],
    ["❤ without U+FE0F", "\u2764"],
    ["a grapheme padded with combining marks", `🦪${"\u0301".repeat(40)}`],
  ])("rejects %s", (_label, input) => {
    const err = (() => {
      try {
        normalizeFolderEmoji(input);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(FolderEmojiError);
    expect((err as Error).message).toBe("Pick a single emoji.");
  });
});

describe("createFolder emoji", () => {
  beforeEach(resetMocks);

  it("stores a valid emoji and returns it", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(0);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: "new-id",
      name: "Code",
      slug: "code",
      emoji: "👩‍💻",
      _count: { links: 0 },
    } as never);

    const result = await createFolder("user-1", "Code", "👩‍💻");

    expect(result.emoji).toBe("👩‍💻");
    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emoji: "👩‍💻" }),
      }),
    );
  });

  it("rejects an invalid emoji before opening the transaction", async () => {
    const err = await createFolder("user-1", "Code", "code").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FolderEmojiError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("normalizeFolderDescription", () => {
  it("trims the description", () => {
    expect(normalizeFolderDescription("  Precious pearls.  ")).toBe(
      "Precious pearls.",
    );
  });

  it.each([[undefined], [null], [""], ["   "]])(
    "treats %j as no description (null)",
    (input) => {
      expect(normalizeFolderDescription(input)).toBeNull();
    },
  );

  it("accepts exactly the max length (after trimming)", () => {
    const max = "a".repeat(MAX_FOLDER_DESCRIPTION_LENGTH);
    expect(normalizeFolderDescription(` ${max} `)).toBe(max);
  });

  it("rejects anything longer", () => {
    const err = (() => {
      try {
        normalizeFolderDescription("a".repeat(MAX_FOLDER_DESCRIPTION_LENGTH + 1));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(FolderDescriptionError);
    expect((err as Error).message).toBe(
      "Keep the description to 160 characters or fewer.",
    );
  });
});

describe("folder description", () => {
  beforeEach(resetMocks);

  it("stores a trimmed description on create and returns it", async () => {
    vi.mocked(prisma.folder.count).mockResolvedValue(0);
    vi.mocked(prisma.folder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.folder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: "new-id",
      name: "Oyster",
      slug: "oyster",
      emoji: null,
      description: "Precious pearls.",
      _count: { links: 0 },
    } as never);

    const result = await createFolder(
      "user-1",
      "Oyster",
      undefined,
      "  Precious pearls. ",
    );

    expect(result.description).toBe("Precious pearls.");
    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Precious pearls." }),
      }),
    );
  });

  it("rejects an over-long description before opening the transaction", async () => {
    const err = await createFolder(
      "user-1",
      "Oyster",
      undefined,
      "a".repeat(MAX_FOLDER_DESCRIPTION_LENGTH + 1),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FolderDescriptionError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates only the description", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValueOnce({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      emoji: null,
      description: "To read.",
      _count: { links: 0 },
    } as never);

    const result = await updateFolder("user-1", "folder-1", {
      description: "To read.",
    });

    expect(result.description).toBe("To read.");
    expect(prisma.folder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { description: "To read." } }),
    );
  });

  it("clears the description with an empty string", async () => {
    vi.mocked(prisma.folder.findFirst).mockResolvedValueOnce({
      id: "folder-1",
      name: "Books",
      slug: "books",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.folder.update).mockResolvedValue({
      id: "folder-1",
      name: "Books",
      slug: "books",
      emoji: null,
      description: null,
      _count: { links: 0 },
    } as never);

    const result = await updateFolder("user-1", "folder-1", { description: "" });

    expect(result.description).toBeNull();
    expect(prisma.folder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { description: null } }),
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
    // Sentinels (not just default `undefined`) so the $transaction assertion
    // below actually pins which two operations were batched, in order —
    // rather than trivially matching because both calls return `undefined`.
    const deleteManySentinel = Symbol("deleteMany-op");
    const deleteSentinel = Symbol("delete-op");
    vi.mocked(prisma.link.deleteMany).mockReturnValue(
      deleteManySentinel as never,
    );
    vi.mocked(prisma.folder.delete).mockReturnValue(deleteSentinel as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 5 }, {}]);

    const result = await deleteFolder("user-1", "folder-1", {
      withLinks: true,
    });

    expect(prisma.link.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", folderId: "folder-1" },
    });
    expect(prisma.folder.delete).toHaveBeenCalledWith({
      where: { id: "folder-1" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      deleteManySentinel,
      deleteSentinel,
    ]);
    expect(result).toEqual({ deletedLinks: 5 });
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

describe("listFoldersForUser summaries", () => {
  beforeEach(resetMocks);

  it("keeps the database's order and maps rows to summaries", async () => {
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { id: "2", name: "Apple", slug: "apple", emoji: "🍎", position: 1, _count: { links: 2 } },
      { id: "1", name: "banana", slug: "banana", emoji: null, position: 2, _count: { links: 0 } },
    ] as never);

    const result = await listFoldersForUser("user-1");
    expect(result.map((f) => f.name)).toEqual(["Apple", "banana"]);
    expect(result[1]).toEqual({
      id: "1",
      name: "banana",
      slug: "banana",
      emoji: DEFAULT_FOLDER_EMOJI,
      description: null,
      isPublic: false,
      position: 2,
      linkCount: 0,
    });
    // A stored emoji wins over the default.
    expect(result[0].emoji).toBe("🍎");
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
      emoji: "📚",
      _count: { links: 4 },
    } as never);
    const result = await getFolderBySlug("user-1", "books");
    expect(result).toEqual({
      id: "1",
      name: "Books",
      slug: "books",
      emoji: "📚",
      description: null,
      isPublic: false,
      position: 0,
      linkCount: 4,
    });
  });
});
