import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-outbound-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { fetchImageAsDataUrl, OG_REMOTE_IMAGE_MAX_BYTES } from "@/lib/og-images";
import { safeFetch } from "@/lib/safe-outbound-fetch";
import sharp from "sharp";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

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

  it("skips what it can't convert or draw, errors and failures", async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/webp"));
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
