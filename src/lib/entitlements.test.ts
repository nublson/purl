import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const client = {
    link: { count: vi.fn(), aggregate: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // Interactive transactions run the callback against the same mocked client.
  client.$transaction.mockImplementation(
    async (cb: (tx: typeof client) => unknown) => cb(client),
  );
  return { default: client };
});

const prisma = (await import("@/lib/prisma")).default;
const {
  assertCanSaveLink,
  assertCanStore,
  getStorageCapForUser,
  getStorageUsedForUser,
  insertWithinSaveLimit,
  LimitError,
  SaveLimitError,
  StorageLimitError,
} = await import("./entitlements");
const { MAX_SAVED_LINKS, MAX_UPLOAD_BYTES_PER_ACCOUNT } = await import("./limits");

const MB = 1024 * 1024;
const STORAGE_MESSAGE =
  "Your 250 MB of storage is full. Delete files you no longer need to upload more.";

function storageUsed(bytes: number | null) {
  vi.mocked(prisma.link.aggregate).mockResolvedValue({
    _sum: { fileSize: bytes },
  } as never);
}

describe("assertCanSaveLink", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.count).mockReset();
  });

  it("allows saving below the cap", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS - 1);
    await expect(assertCanSaveLink("user-1")).resolves.toBeUndefined();
    expect(prisma.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("throws SaveLimitError at the cap", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS);
    const err = await assertCanSaveLink("user-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveLimitError);
    expect((err as InstanceType<typeof SaveLimitError>).feature).toBe("SAVE_LIMIT");
    expect((err as Error).message).toBe("You've reached the 1,000-link limit. Delete links you no longer need to save new ones.");
  });

  it("uses a flat 1,000-link cap for every account", () => {
    expect(MAX_SAVED_LINKS).toBe(1000);
  });
});

describe("insertWithinSaveLimit", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.count).mockReset();
    vi.mocked(prisma.$executeRaw).mockReset();
  });

  it("locks the user, re-counts, then inserts inside one transaction", async () => {
    const order: string[] = [];
    vi.mocked(prisma.$executeRaw).mockImplementation((async () => {
      order.push("lock");
      return 1;
    }) as never);
    vi.mocked(prisma.link.count).mockImplementation((async () => {
      order.push("count");
      return MAX_SAVED_LINKS - 1;
    }) as never);
    const insert = vi.fn(async () => {
      order.push("insert");
      return { id: "link-1" };
    });

    await expect(insertWithinSaveLimit("user-1", insert)).resolves.toEqual({ id: "link-1" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["lock", "count", "insert"]);
    expect(prisma.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(insert).toHaveBeenCalledWith(prisma);
  });

  it("throws SaveLimitError without inserting when a concurrent save filled the cap", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS);
    const insert = vi.fn();

    const err = await insertWithinSaveLimit("user-1", insert).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SaveLimitError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns what `reuse` finds under the lock, without counting or inserting", async () => {
    const order: string[] = [];
    vi.mocked(prisma.$executeRaw).mockImplementation((async () => {
      order.push("lock");
      return 1;
    }) as never);
    // Even at the cap: a row that already exists isn't a new save.
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS);
    const insert = vi.fn();
    const reuse = vi.fn(async () => {
      order.push("reuse");
      return { id: "link-existing" };
    });

    await expect(
      insertWithinSaveLimit("user-1", insert, { reuse }),
    ).resolves.toEqual({ id: "link-existing" });

    expect(order).toEqual(["lock", "reuse"]);
    expect(reuse).toHaveBeenCalledWith(prisma);
    expect(prisma.link.count).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("counts and inserts as usual when `reuse` finds nothing", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS - 1);
    const insert = vi.fn(async () => ({ id: "link-1" }));
    const reuse = vi.fn(async () => null);

    await expect(
      insertWithinSaveLimit("user-1", insert, { reuse }),
    ).resolves.toEqual({ id: "link-1" });

    expect(reuse).toHaveBeenCalledTimes(1);
    expect(prisma.link.count).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(prisma);
  });
});

describe("storage quota", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.count).mockReset();
    vi.mocked(prisma.link.aggregate).mockReset();
    vi.mocked(prisma.$executeRaw).mockReset();
  });

  it("getStorageCapForUser is the flat 250 MB", async () => {
    expect(await getStorageCapForUser("u1")).toBe(250 * MB);
    expect(MAX_UPLOAD_BYTES_PER_ACCOUNT).toBe(250 * MB);
  });

  it("getStorageUsedForUser sums fileSize for the user", async () => {
    storageUsed(42 * MB);
    expect(await getStorageUsedForUser("u1")).toBe(42 * MB);
    expect(prisma.link.aggregate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      _sum: { fileSize: true },
    });
  });

  it("getStorageUsedForUser counts no files (a null sum) as 0", async () => {
    storageUsed(null);
    expect(await getStorageUsedForUser("u1")).toBe(0);
  });

  it("getStorageUsedForUser reads through the given client", async () => {
    const tx = { link: { aggregate: vi.fn(async () => ({ _sum: { fileSize: 7 } })) } };
    expect(await getStorageUsedForUser("u1", tx as never)).toBe(7);
    expect(tx.link.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.link.aggregate).not.toHaveBeenCalled();
  });

  it("assertCanStore allows bytes that fit and rejects bytes that don't", async () => {
    storageUsed(200 * MB);
    await expect(assertCanStore("u1", 50 * MB)).resolves.toBeUndefined();
    const err = await assertCanStore("u1", 50 * MB + 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageLimitError);
    expect((err as Error).message).toBe(STORAGE_MESSAGE);
  });

  it("insertWithinSaveLimit with bytes throws StorageLimitError when used + bytes exceeds the cap and never inserts", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(10);
    storageUsed(250 * MB - 100);
    const insert = vi.fn();

    const err = await insertWithinSaveLimit("u1", insert, { bytes: 101 }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(StorageLimitError);
    expect((err as InstanceType<typeof StorageLimitError>).feature).toBe("STORAGE_LIMIT");
    expect((err as Error).message).toBe(STORAGE_MESSAGE);
    expect(insert).not.toHaveBeenCalled();
  });

  it("insertWithinSaveLimit with bytes exactly filling the cap inserts, checking storage after the count under the lock", async () => {
    const order: string[] = [];
    vi.mocked(prisma.$executeRaw).mockImplementation((async () => {
      order.push("lock");
      return 1;
    }) as never);
    vi.mocked(prisma.link.count).mockImplementation((async () => {
      order.push("count");
      return 10;
    }) as never);
    vi.mocked(prisma.link.aggregate).mockImplementation((async () => {
      order.push("storage");
      return { _sum: { fileSize: 250 * MB - 100 } };
    }) as never);
    const insert = vi.fn(async () => {
      order.push("insert");
      return { id: "link-1" };
    });

    await expect(
      insertWithinSaveLimit("u1", insert, { bytes: 100 }),
    ).resolves.toEqual({ id: "link-1" });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(order).toEqual(["lock", "count", "storage", "insert"]);
  });

  it("insertWithinSaveLimit reports the link cap before storage", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS);
    storageUsed(250 * MB);
    const err = await insertWithinSaveLimit("u1", vi.fn(), { bytes: 1 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SaveLimitError);
  });

  it("insertWithinSaveLimit without bytes never reads storage", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(0);
    await insertWithinSaveLimit("u1", vi.fn(async () => ({ id: "link-1" })));
    expect(prisma.link.aggregate).not.toHaveBeenCalled();
  });

  it("StorageLimitError and SaveLimitError are both LimitError", () => {
    const storage = new StorageLimitError(STORAGE_MESSAGE);
    const save = new SaveLimitError("full");
    expect(storage).toBeInstanceOf(LimitError);
    expect(save).toBeInstanceOf(LimitError);
    expect(storage).toBeInstanceOf(Error);
    expect(storage.feature).toBe("STORAGE_LIMIT");
    expect(save.feature).toBe("SAVE_LIMIT");
    expect(storage.name).toBe("StorageLimitError");
  });
});
