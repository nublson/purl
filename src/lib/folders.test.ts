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
  updateFolder,
  deleteFolder,
  normalizeFolderEmoji,
  FolderEmojiError,
  FolderUpdateEmptyError,
  DEFAULT_FOLDER_EMOJI,
  assertFolderOwned,
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
  $executeRaw: txExecuteRaw,
};

function resetMocks() {
  txExecuteRaw.mockReset().mockResolvedValue(1);
  vi.mocked(prisma.folder.findMany).mockReset();
  vi.mocked(prisma.folder.findFirst).mockReset();
  vi.mocked(prisma.folder.count).mockReset();
  vi.mocked(prisma.folder.create).mockReset();
  vi.mocked(prisma.folder.update).mockReset();
  vi.mocked(prisma.folder.delete).mockReset();
  vi.mocked(prisma.link.deleteMany).mockReset();
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
      emoji: DEFAULT_FOLDER_EMOJI,
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
        create: vi.fn(async () => {
          order.push("create");
          return { id: "new-id", name: "Books", slug: "books", _count: { links: 0 } };
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
      linkCount: 0,
    });
    expect(order).toEqual([
      "lock:SELECT pg_advisory_xact_lock(hashtext(?)):user-1",
      "count",
      "create",
    ]);
    expect(isolatedTx.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: "user-1", name: "Books", slug: "books", emoji: null },
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
    ["✈️", "✈️"],
    // Keycap sequence.
    ["1️⃣", "1️⃣"],
    // Text-default pictograph forced to emoji presentation with U+FE0F.
    ["\u2764\uFE0F", "\u2764\uFE0F"],
    ["\u00A9\uFE0F", "\u00A9\uFE0F"],
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

describe("listFoldersForUser", () => {
  beforeEach(resetMocks);

  it("orders by name, case-insensitive", async () => {
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
      { id: "1", name: "banana", slug: "banana", emoji: null, _count: { links: 0 } },
      { id: "2", name: "Apple", slug: "apple", emoji: "🍎", _count: { links: 2 } },
      { id: "3", name: "cherry", slug: "cherry", _count: { links: 1 } },
    ] as never);

    const result = await listFoldersForUser("user-1");
    expect(result.map((f) => f.name)).toEqual(["Apple", "banana", "cherry"]);
    expect(result[1]).toEqual({
      id: "1",
      name: "banana",
      slug: "banana",
      emoji: DEFAULT_FOLDER_EMOJI,
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
      linkCount: 4,
    });
  });
});
