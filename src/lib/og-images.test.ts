import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the network call is faked; the real byte-limited reader runs.
vi.mock("@/lib/safe-outbound-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-outbound-fetch")>()),
  safeFetch: vi.fn(),
}));

import { fetchImageAsDataUrl, OG_REMOTE_IMAGE_MAX_BYTES } from "@/lib/og-images";
import { safeFetch } from "@/lib/safe-outbound-fetch";
import sharp from "sharp";
import { crc32 } from "node:zlib";

/** A real (tiny) PNG: every image is decoded-checked before use. */
const PNG = new Uint8Array(
  await sharp({ create: { width: 4, height: 4, channels: 3, background: "#123456" } })
    .png()
    .toBuffer(),
);
/** Just a PNG signature and header chunk claiming `width`×`height`. */
function pngHeader(width: number, height: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const type = Buffer.from("IHDR");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, ihdr])));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      length,
      type,
      ihdr,
      crc,
    ]),
  );
}

/** Bytes that only claim to be an image. */
const NOT_AN_IMAGE = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]);

function image(type: string, body: Uint8Array = PNG, status = 200) {
  return new Response(body as BodyInit, { status, headers: { "content-type": type } });
}

describe("fetchImageAsDataUrl", () => {
  beforeEach(() => vi.mocked(safeFetch).mockReset());

  it("inlines a drawable image through safeFetch, size-capped", async () => {
    vi.mocked(safeFetch).mockResolvedValue(image("image/png; charset=binary"));
    expect(await fetchImageAsDataUrl("https://a.example/og.png")).toBe(
      `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
    );
    expect(safeFetch).toHaveBeenCalledWith(
      "https://a.example/og.png",
      expect.objectContaining({ maxResponseBytes: OG_REMOTE_IMAGE_MAX_BYTES }),
    );
  });

  it("converts WebP to a PNG the renderer can draw, scaled down", async () => {
    const webp = await sharp({
      create: { width: 1200, height: 750, channels: 3, background: "#336699" },
    })
      .webp()
      .toBuffer();
    vi.mocked(safeFetch).mockResolvedValue(image("image/webp", new Uint8Array(webp)));
    const result = await fetchImageAsDataUrl("https://a.example/og.webp");
    expect(result).toMatch(/^data:image\/png;base64,/);
    const png = Buffer.from(result!.split(",")[1], "base64");
    const { width, format } = await sharp(png).metadata();
    expect(format).toBe("png");
    expect(width).toBe(480);
  });

  it("scales a large JPEG down and keeps it a JPEG", async () => {
    const jpeg = await sharp({
      create: { width: 3000, height: 1875, channels: 3, background: "#996633" },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    // Padded past the resize threshold (sharp ignores trailing bytes).
    const padded = new Uint8Array(400 * 1024);
    padded.set(jpeg);
    vi.mocked(safeFetch).mockResolvedValue(image("image/jpeg", padded));
    const result = await fetchImageAsDataUrl("https://a.example/cover.jpg");
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    const { width } = await sharp(Buffer.from(result!.split(",")[1], "base64")).metadata();
    expect(width).toBe(480);
  });

  it("checks every image: the bytes decide, and the pixel cap holds", async () => {
    // Labelled PNG, but HTML: rejected even though it's small.
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/png", NOT_AN_IMAGE));
    expect(await fetchImageAsDataUrl("https://a.example/fake.png")).toBeNull();
    // Labelled JPEG, really a PNG: inlined as what it is.
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/jpeg"));
    expect(await fetchImageAsDataUrl("https://a.example/mislabelled.jpg")).toMatch(
      /^data:image\/png;base64,/,
    );
    // A few bytes claiming 10000×10000 (over the 40M-pixel cap): rejected
    // from the header alone.
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/png", pngHeader(10_000, 10_000)));
    expect(await fetchImageAsDataUrl("https://a.example/bomb.png")).toBeNull();
  });

  it("stops reading past the cap when Content-Length is missing", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(endless, { headers: { "content-type": "image/png" } }),
    );
    expect(await fetchImageAsDataUrl("https://a.example/endless.png")).toBeNull();
    // 6MB cap in 1MB chunks: it gave up around the 7th, not at the end.
    expect(pulled).toBeLessThan(10);
  });

  it("skips what it can't convert or draw, errors and failures", async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/webp", NOT_AN_IMAGE));
    expect(await fetchImageAsDataUrl("https://a.example/broken.webp")).toBeNull();
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/svg+xml"));
    expect(await fetchImageAsDataUrl("https://a.example/a.svg")).toBeNull();
    vi.mocked(safeFetch).mockResolvedValueOnce(image("text/html"));
    expect(await fetchImageAsDataUrl("https://a.example/page")).toBeNull();
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/png", PNG, 404));
    expect(await fetchImageAsDataUrl("https://a.example/missing.png")).toBeNull();
    vi.mocked(safeFetch).mockRejectedValueOnce(new Error("blocked"));
    expect(await fetchImageAsDataUrl("http://127.0.0.1/x.png")).toBeNull();
    expect(await fetchImageAsDataUrl(null)).toBeNull();
  });

  it("rejects a body over the cap even without Content-Length", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      image("image/jpeg", new Uint8Array(OG_REMOTE_IMAGE_MAX_BYTES + 1)),
    );
    expect(await fetchImageAsDataUrl("https://a.example/huge.jpg")).toBeNull();
  });
});
