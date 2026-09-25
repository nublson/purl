import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { count: vi.fn() },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { assertCanSaveLink, SaveLimitError } = await import("./entitlements");
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
