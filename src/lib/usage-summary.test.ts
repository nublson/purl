import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { count: vi.fn(), aggregate: vi.fn() },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { getUsageSummaryForUser } = await import("./usage-summary");
const { MAX_UPLOAD_BYTES_PER_ACCOUNT } = await import("./limits");

describe("getUsageSummaryForUser", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.count).mockReset();
    vi.mocked(prisma.link.aggregate).mockReset();
  });

  it("returns the link count against the flat cap and the storage used against its cap", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(42);
    vi.mocked(prisma.link.aggregate).mockResolvedValue({
      _sum: { fileSize: 5_000_000 },
    } as never);

    await expect(getUsageSummaryForUser("user-1")).resolves.toEqual({
      saves: { used: 42, cap: 1000 },
      storage: { used: 5_000_000, cap: MAX_UPLOAD_BYTES_PER_ACCOUNT },
    });
    expect(prisma.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.link.aggregate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      _sum: { fileSize: true },
    });
  });

  it("reads storage as 0 when the account has no files", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(3);
    vi.mocked(prisma.link.aggregate).mockResolvedValue({
      _sum: { fileSize: null },
    } as never);

    const summary = await getUsageSummaryForUser("user-1");
    expect(summary.storage.used).toBe(0);
  });
});
