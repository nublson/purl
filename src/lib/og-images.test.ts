import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-outbound-fetch", () => ({
  safeFetch: vi.fn(),
}));

import {
  fetchImageAsDataUrl,
  firstDrawableImages,
  OG_REMOTE_IMAGE_MAX_BYTES,
} from "@/lib/og-images";
import { safeFetch } from "@/lib/safe-outbound-fetch";

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

  it("skips formats the renderer can't draw, errors and failures", async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(image("image/webp"));
    expect(await fetchImageAsDataUrl("https://a.example/a.webp")).toBeNull();
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

describe("firstDrawableImages", () => {
  it("keeps the first ones that load, in order", async () => {
    vi.mocked(safeFetch).mockImplementation(async (url) =>
      String(url).includes("bad") ? image("image/webp") : image("image/png"),
    );
    const result = await firstDrawableImages(
      ["https://a/bad", null, "https://a/1", "https://a/2", "https://a/3"],
      2,
    );
    expect(result).toHaveLength(2);
    expect(result.every((src) => src.startsWith("data:image/png;base64,"))).toBe(true);
  });
});
