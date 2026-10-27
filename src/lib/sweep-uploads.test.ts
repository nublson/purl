import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  head: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
  BlobNotFoundError: class BlobNotFoundError extends Error {},
}));

vi.mock("@/lib/prisma", () => ({
  default: { link: { findMany: vi.fn() } },
}));

const { del, list } = await import("@vercel/blob");
const prisma = (await import("@/lib/prisma")).default;
const { SWEEP_BUDGET, SWEEP_MIN_AGE_MS, sweepOrphanUploads } = await import(
  "./sweep-uploads"
);

type ListResult = Awaited<ReturnType<typeof list>>;

const HOST = "https://abc123.public.blob.vercel-storage.com";
const NOW = new Date("2026-10-27T12:00:00Z");
const OLD = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const HALF_HOUR_AGO = new Date(NOW.getTime() - 30 * 60 * 1000);

const blob = (pathname: string, uploadedAt: Date = OLD) => ({
  url: `${HOST}/${pathname}`,
  downloadUrl: `${HOST}/${pathname}?download=1`,
  pathname,
  size: 10,
  uploadedAt,
  etag: "etag",
});

const page = (
  blobs: ReturnType<typeof blob>[],
  cursor?: string,
): ListResult =>
  ({ blobs, hasMore: !!cursor, cursor }) as unknown as ListResult;

const findMany = vi.mocked(prisma.link.findMany);

/** Rows that reference `refs` (as `{ url, thumbnail }`). */
function referencedBy(refs: { url: string; thumbnail: string | null }[]) {
  findMany.mockResolvedValue(refs as never);
}

describe("sweepOrphanUploads", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "token");
    vi.mocked(list).mockReset();
    vi.mocked(del).mockReset().mockResolvedValue(undefined);
    findMany.mockReset().mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses a 500-blob budget and a one-hour minimum age", () => {
    expect(SWEEP_BUDGET).toBe(500);
    expect(SWEEP_MIN_AGE_MS).toBe(60 * 60 * 1000);
  });

  it("deletes an old blob no row references and keeps the referenced ones", async () => {
    const file = blob("users/u1/c1/shot.png");
    const preview = blob("users/u1/c1/preview.webp");
    const orphan = blob("users/u1/c2/lost.mp3");
    vi.mocked(list).mockResolvedValueOnce(page([file, preview, orphan]));
    referencedBy([{ url: file.url, thumbnail: preview.url }]);

    const result = await sweepOrphanUploads({ now: NOW });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { url: { in: [file.url, preview.url, orphan.url] } },
          { thumbnail: { in: [file.url, preview.url, orphan.url] } },
        ],
      },
      select: { url: true, thumbnail: true },
    });
    expect(vi.mocked(del).mock.calls).toEqual([[[orphan.url]]]);
    expect(result).toEqual({ listed: 3, deleted: 1, stopped: false });
  });

  it("keeps a blob referenced only as a row's thumbnail", async () => {
    const preview = blob("users/u1/c1/preview.webp");
    vi.mocked(list).mockResolvedValueOnce(page([preview]));
    referencedBy([{ url: "https://example.com/", thumbnail: preview.url }]);

    const result = await sweepOrphanUploads({ now: NOW });

    expect(del).not.toHaveBeenCalled();
    expect(result).toEqual({ listed: 1, deleted: 0, stopped: false });
  });

  it("keeps a blob referenced only as a row's url", async () => {
    const file = blob("users/u1/c1/shot.png");
    vi.mocked(list).mockResolvedValueOnce(page([file]));
    referencedBy([{ url: file.url, thumbnail: null }]);

    const result = await sweepOrphanUploads({ now: NOW });

    expect(del).not.toHaveBeenCalled();
    expect(result).toEqual({ listed: 1, deleted: 0, stopped: false });
  });

  it("keeps an unreferenced blob uploaded 30 minutes ago", async () => {
    const fresh = blob("users/u1/c1/new.png", HALF_HOUR_AGO);
    vi.mocked(list).mockResolvedValueOnce(page([fresh]));

    const result = await sweepOrphanUploads({ now: NOW });

    expect(findMany).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(result).toEqual({ listed: 1, deleted: 0, stopped: false });
  });

  it("follows the cursor across pages under users/", async () => {
    const a = blob("users/u1/a/a.png");
    const b = blob("users/u2/b/b.mp3");
    vi.mocked(list)
      .mockResolvedValueOnce(page([a], "c2"))
      .mockResolvedValueOnce(page([b]));

    const result = await sweepOrphanUploads({ now: NOW });

    expect(vi.mocked(list).mock.calls).toEqual([
      [{ prefix: "users/", cursor: undefined, limit: 1000 }],
      [{ prefix: "users/", cursor: "c2", limit: 1000 }],
    ]);
    expect(vi.mocked(del).mock.calls).toEqual([[[a.url]], [[b.url]]]);
    expect(result).toEqual({ listed: 2, deleted: 2, stopped: false });
  });

  it("stops at the budget, deleting exactly 500, and pages no further", async () => {
    const first = Array.from({ length: 400 }, (_, i) =>
      blob(`users/u1/a${i}/f.png`),
    );
    const second = Array.from({ length: 400 }, (_, i) =>
      blob(`users/u1/b${i}/f.png`),
    );
    vi.mocked(list)
      .mockResolvedValueOnce(page(first, "c2"))
      .mockResolvedValueOnce(page(second, "c3"))
      .mockResolvedValueOnce(page([blob("users/u1/c/f.png")]));

    const result = await sweepOrphanUploads({ now: NOW });

    expect(list).toHaveBeenCalledTimes(2);
    const deletedUrls = vi.mocked(del).mock.calls.flatMap(([urls]) => urls);
    expect(deletedUrls).toHaveLength(500);
    expect(vi.mocked(del).mock.calls[1][0]).toEqual(
      second.slice(0, 100).map((b) => b.url),
    );
    expect(result).toEqual({ listed: 800, deleted: 500, stopped: true });
  });

  it("takes a smaller budget", async () => {
    vi.mocked(list).mockResolvedValueOnce(
      page([blob("users/u1/a/a.png"), blob("users/u1/b/b.png")], "c2"),
    );

    const result = await sweepOrphanUploads({ now: NOW, budget: 1 });

    expect(list).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ listed: 2, deleted: 1, stopped: true });
  });

  it("logs a failed del and goes on to the next page", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = blob("users/u1/a/a.png");
    const b = blob("users/u1/b/b.mp3");
    vi.mocked(list)
      .mockResolvedValueOnce(page([a], "c2"))
      .mockResolvedValueOnce(page([b]));
    vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));

    const result = await sweepOrphanUploads({ now: NOW });

    expect(error).toHaveBeenCalledWith("[uploads] del failed", expect.any(Error));
    expect(vi.mocked(del).mock.calls[1]).toEqual([[b.url]]);
    expect(result).toEqual({ listed: 2, deleted: 1, stopped: false });
  });

  it("ends the run on a failed list, returning what it counted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(list)
      .mockResolvedValueOnce(page([blob("users/u1/a/a.png")], "c2"))
      .mockRejectedValueOnce(new Error("blob down"));

    const result = await sweepOrphanUploads({ now: NOW });

    expect(error).toHaveBeenCalled();
    expect(result).toEqual({ listed: 1, deleted: 1, stopped: false });
  });

  it("does nothing when uploads are disabled", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");

    const result = await sweepOrphanUploads({ now: NOW });

    expect(list).not.toHaveBeenCalled();
    expect(result).toEqual({ listed: 0, deleted: 0, stopped: false });
  });
});
