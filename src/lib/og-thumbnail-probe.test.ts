import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-outbound-fetch", () => ({
  safeFetch: vi.fn(),
  limitReadableStreamByBytes: vi.fn(),
}));

const { safeFetch, limitReadableStreamByBytes } = await import(
  "@/lib/safe-outbound-fetch"
);
const { validateOgThumbnailUrl } = await import("./og-thumbnail-probe");

function makeResponse(
  status: number,
  contentType: string | null,
  body?: ReadableStream<Uint8Array> | null,
): Response {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  const res = new Response(body ?? null, { status, headers });
  return res;
}

/** Build a ReadableStream that yields the provided bytes. */
function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

describe("validateOgThumbnailUrl", () => {
  beforeEach(() => {
    vi.mocked(limitReadableStreamByBytes).mockImplementation(
      (stream) => stream,
    );
  });

  afterEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(limitReadableStreamByBytes).mockReset();
  });

  describe("HEAD probe – known content types", () => {
    it("returns true immediately when HEAD returns an image content-type", async () => {
      vi.mocked(safeFetch).mockResolvedValueOnce(
        makeResponse(200, "image/png", null),
      );

      const result = await validateOgThumbnailUrl("https://img.example.com/pic.png");

      expect(result).toBe(true);
      // GET should not be issued
      expect(vi.mocked(safeFetch)).toHaveBeenCalledTimes(1);
    });

    it("returns false immediately when HEAD returns text/html content-type", async () => {
      vi.mocked(safeFetch).mockResolvedValueOnce(
        makeResponse(200, "text/html; charset=utf-8", null),
      );

      const result = await validateOgThumbnailUrl("https://example.com/page");

      expect(result).toBe(false);
      expect(vi.mocked(safeFetch)).toHaveBeenCalledTimes(1);
    });

    it("returns false when HEAD returns a non-ok status", async () => {
      vi.mocked(safeFetch).mockResolvedValueOnce(
        makeResponse(404, "text/html", null),
      );

      const result = await validateOgThumbnailUrl("https://example.com/missing.png");

      expect(result).toBe(false);
      expect(vi.mocked(safeFetch)).toHaveBeenCalledTimes(1);
    });
  });

  describe("HEAD probe – inconclusive → GET fallback", () => {
    it("falls back to GET when HEAD returns 405 (method not allowed)", async () => {
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(makeResponse(200, "image/jpeg", null));

      const result = await validateOgThumbnailUrl("https://img.example.com/photo");

      expect(result).toBe(true);
      expect(vi.mocked(safeFetch)).toHaveBeenCalledTimes(2);
    });

    it("falls back to GET when HEAD has no content-type", async () => {
      // HEAD: 200 OK, no content-type (null body → no implicit content-type header)
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(200, null, null))
        .mockResolvedValueOnce(makeResponse(200, "image/webp", null));

      const result = await validateOgThumbnailUrl("https://cdn.example.com/img");

      expect(result).toBe(true);
      expect(vi.mocked(safeFetch)).toHaveBeenCalledTimes(2);
    });

    it("falls back to GET when HEAD throws (network error)", async () => {
      vi.mocked(safeFetch)
        .mockRejectedValueOnce(new Error("connection refused"))
        .mockResolvedValueOnce(makeResponse(200, "image/png", null));

      const result = await validateOgThumbnailUrl("https://cdn.example.com/img");

      expect(result).toBe(true);
    });
  });

  describe("GET probe – content-type check", () => {
    it("returns true when GET returns an image content-type without reading bytes", async () => {
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(makeResponse(200, "image/gif", null));

      const result = await validateOgThumbnailUrl("https://cdn.example.com/anim.gif");

      expect(result).toBe(true);
    });

    it("returns false when GET returns a non-ok status", async () => {
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(makeResponse(403, "text/html", null));

      const result = await validateOgThumbnailUrl("https://cdn.example.com/forbidden");

      expect(result).toBe(false);
    });

    it("returns false when GET throws", async () => {
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockRejectedValueOnce(new Error("timeout"));

      const result = await validateOgThumbnailUrl("https://cdn.example.com/img");

      expect(result).toBe(false);
    });
  });

  describe("GET probe – magic byte sniffing", () => {
    it("returns true for a PNG magic header (0x89 50 4E 47)", async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(
          makeResponse(200, "application/octet-stream", bytesStream(pngBytes)),
        );

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(true);
    });

    it("returns true for a JPEG magic header (0xFF D8 FF)", async () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(
          makeResponse(200, "application/octet-stream", bytesStream(jpegBytes)),
        );

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(true);
    });

    it("returns true for a GIF magic header (GIF8)", async () => {
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(
          makeResponse(200, "application/octet-stream", bytesStream(gifBytes)),
        );

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(true);
    });

    it("returns true for a RIFF/WEBP magic header", async () => {
      const webpBytes = new Uint8Array(12);
      // RIFF
      webpBytes[0] = 0x52; webpBytes[1] = 0x49; webpBytes[2] = 0x46; webpBytes[3] = 0x46;
      // size (4 bytes, ignored)
      webpBytes[4] = 0x00; webpBytes[5] = 0x00; webpBytes[6] = 0x00; webpBytes[7] = 0x00;
      // WEBP
      webpBytes[8] = 0x57; webpBytes[9] = 0x45; webpBytes[10] = 0x42; webpBytes[11] = 0x50;

      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(
          makeResponse(200, "application/octet-stream", bytesStream(webpBytes)),
        );

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(true);
    });

    it("returns true for a BMP magic header (0x42 0x4D)", async () => {
      const bmpBytes = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(
          makeResponse(200, "application/octet-stream", bytesStream(bmpBytes)),
        );

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(true);
    });

    it("returns false for unrecognised binary data", async () => {
      const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(
          makeResponse(200, "application/octet-stream", bytesStream(garbage)),
        );

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(false);
    });

    it("returns false when GET response has no body", async () => {
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(makeResponse(405, "text/html", null))
        .mockResolvedValueOnce(makeResponse(200, "application/octet-stream", null));

      expect(await validateOgThumbnailUrl("https://cdn.example.com/raw")).toBe(false);
    });
  });
});
