import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const { notifyLinksAfterIngest } = await import("./notify-links-after-ingest");

describe("notifyLinksAfterIngest", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.findUnique).mockReset();
    vi.mocked(broadcastLinksChanged).mockReset();
  });

  it("broadcasts to the link owner when the link is found", async () => {
    vi.mocked(prisma.link.findUnique).mockResolvedValue(
      { userId: "user-123" } as never,
    );
    vi.mocked(broadcastLinksChanged).mockResolvedValue(undefined);

    await notifyLinksAfterIngest("link-1");

    expect(prisma.link.findUnique).toHaveBeenCalledWith({
      where: { id: "link-1" },
      select: { userId: true },
    });
    expect(broadcastLinksChanged).toHaveBeenCalledWith("user-123");
  });

  it("does not broadcast when no link row is found", async () => {
    vi.mocked(prisma.link.findUnique).mockResolvedValue(null);

    await notifyLinksAfterIngest("ghost-link");

    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("does not broadcast when the link row has no userId", async () => {
    vi.mocked(prisma.link.findUnique).mockResolvedValue(
      { userId: null } as never,
    );

    await notifyLinksAfterIngest("link-no-user");

    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("silently swallows errors so ingest is never broken by notification failure", async () => {
    vi.mocked(prisma.link.findUnique).mockRejectedValue(
      new Error("DB connection lost"),
    );

    await expect(notifyLinksAfterIngest("link-1")).resolves.toBeUndefined();
    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("swallows errors thrown by broadcastLinksChanged itself", async () => {
    vi.mocked(prisma.link.findUnique).mockResolvedValue(
      { userId: "user-123" } as never,
    );
    vi.mocked(broadcastLinksChanged).mockRejectedValue(
      new Error("Realtime channel unavailable"),
    );

    await expect(notifyLinksAfterIngest("link-1")).resolves.toBeUndefined();
  });
});
