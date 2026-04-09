import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notify-links-after-ingest", () => ({
  notifyLinksAfterIngest: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { notifyLinksAfterIngest } = await import(
  "@/lib/notify-links-after-ingest"
);
const { skipIngest } = await import("./ingest-skip");

describe("skipIngest", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(notifyLinksAfterIngest).mockReset();
    vi.mocked(prisma.link.update).mockResolvedValue({} as never);
    vi.mocked(notifyLinksAfterIngest).mockResolvedValue(undefined);
  });

  it("sets ingestStatus to SKIPPED for the given linkId", async () => {
    await skipIngest("link-1");

    expect(prisma.link.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "SKIPPED" },
    });
  });

  it("calls notifyLinksAfterIngest after updating the status", async () => {
    await skipIngest("link-2");

    expect(notifyLinksAfterIngest).toHaveBeenCalledWith("link-2");
  });

  it("calls prisma update before notifyLinksAfterIngest", async () => {
    await skipIngest("link-3");

    const updateCallOrder = vi.mocked(prisma.link.update).mock.invocationCallOrder[0];
    const notifyCallOrder = vi
      .mocked(notifyLinksAfterIngest)
      .mock.invocationCallOrder[0];

    expect(updateCallOrder).toBeLessThan(notifyCallOrder);
  });

  it("propagates errors thrown by prisma.link.update", async () => {
    vi.mocked(prisma.link.update).mockRejectedValue(
      new Error("DB connection lost"),
    );

    await expect(skipIngest("link-1")).rejects.toThrow("DB connection lost");
    expect(notifyLinksAfterIngest).not.toHaveBeenCalled();
  });
});
