import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const client = {
    $queryRaw: vi.fn(),
    readerView: { updateMany: vi.fn() },
  };
  return { default: client, prisma: client };
});
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastLinksChanged: vi.fn() }));
vi.mock("@/lib/safe-outbound-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/safe-outbound-fetch")>();
  return { ...actual, safeFetch: vi.fn() };
});

const prisma = (await import("@/lib/prisma")).default;
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const { safeFetch, UnsafeOutboundUrlError } = await import(
  "@/lib/safe-outbound-fetch"
);
const {
  READER_ABORT_GRACE_MS,
  READER_BATCH_SIZE,
  READER_FETCH_TIMEOUT_MS,
  READER_HTML_MAX_BYTES,
} = await import("@/lib/limits");
const { buildPendingReaderViews, makeReaderView } = await import(
  "./reader-views"
);

const queryRaw = vi.mocked(prisma.$queryRaw);
const updateMany = vi.mocked(prisma.readerView.updateMany);
const fetchMock = vi.mocked(safeFetch);
const broadcast = vi.mocked(broadcastLinksChanged);

const fixture = (n: string) =>
  readFileSync(join(__dirname, "reader-fixtures", n), "utf8");

function html(body: string, init: { type?: string; status?: number; url?: string } = {}) {
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "text/html; charset=utf-8" },
  });
  if (init.url) Object.defineProperty(res, "url", { value: init.url });
  return res;
}

const signal = new AbortController().signal;

describe("makeReaderView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes READY markdown from an article", async () => {
    fetchMock.mockResolvedValue(html(fixture("article.html")));
    const out = await makeReaderView("https://example.com/a", signal);
    expect(out.status).toBe("READY");
    if (out.status === "READY") {
      expect(out.markdown.length).toBeGreaterThan(0);
      expect(out.truncated).toBe(false);
      expect(out.bytes).toBeGreaterThan(0);
    }
  });

  it("is FAILED/unreachable for a 500 and a network error", async () => {
    fetchMock.mockResolvedValueOnce(html("x", { status: 500 }));
    expect(await makeReaderView("https://example.com/a", signal)).toEqual({
      status: "FAILED",
      reason: "unreachable",
    });
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await makeReaderView("https://example.com/a", signal)).toEqual({
      status: "FAILED",
      reason: "unreachable",
    });
  });

  it("is NONE/not_html for a PDF", async () => {
    fetchMock.mockResolvedValue(html("%PDF", { type: "application/pdf" }));
    expect(await makeReaderView("https://example.com/a", signal)).toEqual({
      status: "NONE",
      reason: "not_html",
    });
  });

  it("is NONE/no_article when there is no article", async () => {
    fetchMock.mockResolvedValue(html(fixture("no-article.html")));
    expect(await makeReaderView("https://example.com/a", signal)).toEqual({
      status: "NONE",
      reason: "no_article",
    });
  });

  it("is FAILED/too_large when safeFetch refuses the size", async () => {
    fetchMock.mockRejectedValue(
      new UnsafeOutboundUrlError("Response exceeds maximum size"),
    );
    expect(await makeReaderView("https://example.com/a", signal)).toEqual({
      status: "FAILED",
      reason: "too_large",
    });
  });

  it("is FAILED/too_large from the stream", async () => {
    const big = new Uint8Array(READER_HTML_MAX_BYTES + 1);
    fetchMock.mockResolvedValue(
      new Response(big, { headers: { "content-type": "text/html" } }),
    );
    expect(await makeReaderView("https://example.com/a", signal)).toEqual({
      status: "FAILED",
      reason: "too_large",
    });
  });

  it("sends the headers, size cap and signal", async () => {
    fetchMock.mockResolvedValue(html(fixture("no-article.html")));
    await makeReaderView("https://example.com/a", signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/a",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/html,application/xhtml+xml",
        }),
        maxResponseBytes: READER_HTML_MAX_BYTES,
        signal,
      }),
    );
  });

  it("resolves relative links against the final URL after redirects", async () => {
    const page = fixture("article.html").replace(
      "</body>",
      '<p><a href="/rel">rel</a></p></body>',
    );
    fetchMock.mockResolvedValue(html(page, { url: "https://final.test/dir/x" }));
    const out = await makeReaderView("https://example.com/a", signal);
    if (out.status === "READY" && out.markdown.includes("rel]")) {
      expect(out.markdown).toContain("https://final.test/rel");
    }
    expect(out.status).toBe("READY");
  });
});

describe("buildPendingReaderViews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.useRealTimers());

  const claimedAt = new Date("2026-11-01T10:00:00Z");
  const row = (n: number, userId = "u1") => ({
    linkId: `l${n}`,
    userId,
    url: `https://example.com/${n}`,
    claimedAt,
  });

  it("combines new and stale claims, writes results and broadcasts per user", async () => {
    queryRaw.mockResolvedValueOnce([row(1, "u1")]).mockResolvedValueOnce([row(2, "u2")]);
    fetchMock.mockImplementation(async (u) =>
      String(u).endsWith("/1")
        ? html(fixture("article.html"))
        : html(fixture("no-article.html")),
    );
    const out = await buildPendingReaderViews();
    expect(out).toEqual({ claimed: 2, ready: 1, none: 1, failed: 0 });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { linkId: "l1", claimedAt },
        data: expect.objectContaining({ status: "READY", fetchedAt: expect.any(Date) }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { linkId: "l2", claimedAt },
        data: expect.objectContaining({ status: "NONE", reason: "no_article" }),
      }),
    );
    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenCalledWith("u1");
    expect(broadcast).toHaveBeenCalledWith("u2");
  });

  it("skips the stale claim when the new one fills the batch", async () => {
    queryRaw.mockResolvedValueOnce(
      Array.from({ length: READER_BATCH_SIZE }, (_, i) => row(i)),
    );
    fetchMock.mockImplementation(async () => html(fixture("no-article.html")));
    const out = await buildPendingReaderViews();
    expect(out.claimed).toBe(READER_BATCH_SIZE);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("aborts a fetch that never settles and writes FAILED/timeout", async () => {
    vi.useFakeTimers();
    queryRaw.mockResolvedValueOnce([row(1)]).mockResolvedValueOnce([]);
    let aborted = false;
    fetchMock.mockImplementation((_u, init) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<Response>(() => {});
    });
    const run = buildPendingReaderViews();
    await vi.advanceTimersByTimeAsync(READER_FETCH_TIMEOUT_MS);
    expect(aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(READER_ABORT_GRACE_MS);
    expect(await run).toEqual({ claimed: 1, ready: 0, none: 0, failed: 1 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", reason: "timeout" }),
      }),
    );
  });

  it("drops the result when the row was reset meanwhile", async () => {
    queryRaw.mockResolvedValueOnce([row(1)]).mockResolvedValueOnce([]);
    fetchMock.mockResolvedValue(html(fixture("article.html")));
    updateMany.mockResolvedValue({ count: 0 });
    const out = await buildPendingReaderViews();
    expect(out).toEqual({ claimed: 1, ready: 0, none: 0, failed: 0 });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("logs and ends the run when a claim fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValueOnce(new Error("db down"));
    expect(await buildPendingReaderViews()).toEqual({
      claimed: 0,
      ready: 0,
      none: 0,
      failed: 0,
    });
    expect(err).toHaveBeenCalledWith("[reader] run failed", expect.any(Error));
    err.mockRestore();
  });
});
