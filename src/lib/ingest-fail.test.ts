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
const { failIngest } = await import("./ingest-fail");

describe("failIngest", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(notifyLinksAfterIngest).mockReset();
    vi.mocked(prisma.link.update).mockResolvedValue({} as never);
    vi.mocked(notifyLinksAfterIngest).mockResolvedValue(undefined);
  });

  it("marks the link as FAILED with the given reason", async () => {
    await failIngest("link-1", "SCRAPE_FAILED");

    expect(prisma.link.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "FAILED", ingestFailureReason: "SCRAPE_FAILED" },
    });
  });

  it("defaults reason to OTHER when not provided", async () => {
    await failIngest("link-2");

    expect(prisma.link.update).toHaveBeenCalledWith({
      where: { id: "link-2" },
      data: { ingestStatus: "FAILED", ingestFailureReason: "OTHER" },
    });
  });

  it("calls notifyLinksAfterIngest with the link id after updating", async () => {
    await failIngest("link-3", "LINK_NOT_FOUND");

    expect(notifyLinksAfterIngest).toHaveBeenCalledWith("link-3");
  });

  it("calls notify after the prisma update (order matters)", async () => {
    await failIngest("link-4");

    const updateCallOrder = vi.mocked(prisma.link.update).mock
      .invocationCallOrder[0];
    const notifyCallOrder = vi.mocked(notifyLinksAfterIngest).mock
      .invocationCallOrder[0];

    expect(updateCallOrder).toBeLessThan(notifyCallOrder);
  });

  it("propagates errors thrown by prisma.link.update", async () => {
    vi.mocked(prisma.link.update).mockRejectedValue(new Error("db error"));

    await expect(failIngest("link-5")).rejects.toThrow("db error");
    expect(notifyLinksAfterIngest).not.toHaveBeenCalled();
  });

  it("supports all IngestFailureReason values", async () => {
    const reasons = [
      "SCRAPE_FAILED",
      "LINK_NOT_FOUND",
      "OTHER",
    ] as const;

    for (const reason of reasons) {
      vi.mocked(prisma.link.update).mockClear();
      await failIngest("link-x", reason);
      expect(prisma.link.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ingestFailureReason: reason }),
        }),
      );
    }
  });
});
