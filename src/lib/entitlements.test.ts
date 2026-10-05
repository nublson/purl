import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const client = {
    link: { count: vi.fn() },
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
const { assertCanSaveLink, insertWithinSaveLimit, SaveLimitError } = await import("./entitlements");
const { MAX_SAVED_LINKS } = await import("./limits");

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
});
