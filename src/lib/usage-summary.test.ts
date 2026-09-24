import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { count: vi.fn() },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { getUsageSummaryForUser } = await import("./usage-summary");

describe("getUsageSummaryForUser", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.count).mockReset();
  });

  it("returns the user's link count against the flat cap", async () => {
    vi.mocked(prisma.link.count).mockResolvedValue(42);

    await expect(getUsageSummaryForUser("user-1")).resolves.toEqual({
      saves: { used: 42, cap: 1000 },
    });
    expect(prisma.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});
