import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    usageEvent: {
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { recordUsage, countUsage } = await import("./usage");

describe("recordUsage", () => {
  beforeEach(() => {
    vi.mocked(prisma.usageEvent.create).mockReset();
    vi.mocked(prisma.usageEvent.create).mockResolvedValue({} as never);
  });

  it("creates a usage event with userId and kind", async () => {
    await recordUsage("user-1", "CHAT_MSG");

    expect(prisma.usageEvent.create).toHaveBeenCalledWith({
      data: { userId: "user-1", kind: "CHAT_MSG", meta: undefined },
    });
  });

  it("includes meta when provided", async () => {
    await recordUsage("user-1", "EXTRACT", { linkId: "link-1" });

    expect(prisma.usageEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        kind: "EXTRACT",
        meta: { linkId: "link-1" },
      },
    });
  });
});

describe("countUsage", () => {
  beforeEach(() => {
    vi.mocked(prisma.usageEvent.count).mockReset();
  });

  it("counts events since the given date", async () => {
    const since = new Date("2026-01-01T00:00:00.000Z");
    vi.mocked(prisma.usageEvent.count).mockResolvedValue(5);

    const result = await countUsage("user-1", "CHAT_MSG", { since });

    expect(result).toBe(5);
    expect(prisma.usageEvent.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        kind: "CHAT_MSG",
        createdAt: { gte: since },
      },
    });
  });

  it("adds an until upper bound when provided", async () => {
    const since = new Date("2026-01-01T00:00:00.000Z");
    const until = new Date("2026-02-01T00:00:00.000Z");
    vi.mocked(prisma.usageEvent.count).mockResolvedValue(3);

    await countUsage("user-1", "EXTRACT", { since, until });

    expect(prisma.usageEvent.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        kind: "EXTRACT",
        createdAt: { gte: since, lt: until },
      },
    });
  });
});
