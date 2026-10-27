import { describe, expect, it, vi } from "vitest";
import {
  detectContentTypeFromUrlRules,
  detectContentTypeWithFetch,
  sniffContentTypeFromHeadWithFetch,
  type HeadFetchFn,
} from "./link-content-type-shared";

describe("detectContentTypeWithFetch signal", () => {
  function headFetch() {
    return vi.fn<HeadFetchFn>(
      async () =>
        new Response(null, { headers: { "content-type": "text/html" } }),
    );
  }

  it("aborts the HEAD sniff when the caller's signal aborts", async () => {
    const fetchImpl = headFetch();
    const outer = new AbortController();

    await detectContentTypeWithFetch(
      "https://example.com/page",
      fetchImpl,
      outer.signal,
    );

    const sniffSignal = fetchImpl.mock.calls[0]![1]!.signal!;
    expect(sniffSignal.aborted).toBe(false);
    outer.abort();
    expect(sniffSignal.aborted).toBe(true);
  });

  it("keeps its own timeout when no signal is passed", async () => {
    const fetchImpl = headFetch();
    await detectContentTypeWithFetch("https://example.com/page", fetchImpl);
    expect(fetchImpl.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("makes no request at all for a URL the rules already classify", async () => {
    const fetchImpl = headFetch();
    const outer = new AbortController();
    await expect(
      detectContentTypeWithFetch(
        "https://www.youtube.com/watch?v=abc",
        fetchImpl,
        outer.signal,
      ),
    ).resolves.toEqual({ contentType: "YOUTUBE", mimeType: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("detectContentTypeFromUrlRules", () => {
  it.each([
    ["https://x.test/a.PNG", "IMAGE"],
    ["https://x.test/a.svg", "IMAGE"],
    ["https://x.test/clip.mov", "VIDEO"],
    ["https://x.test/clip.webm", "VIDEO"],
    ["https://x.test/song.mp3", "AUDIO"],
    ["https://x.test/doc.pdf", "PDF"],
    ["https://x.test/page", null],
  ])("%s -> %s", (url, expected) => {
    expect(detectContentTypeFromUrlRules(url)).toBe(expected);
  });
});

describe("sniffContentTypeFromHeadWithFetch", () => {
  function sniff(contentType: string) {
    return sniffContentTypeFromHeadWithFetch(
      "https://x.test/thing",
      async () =>
        new Response(null, { headers: { "content-type": contentType } }),
    );
  }

  it("maps image/* to IMAGE with the mime type", async () => {
    await expect(sniff("image/webp")).resolves.toEqual({
      contentType: "IMAGE",
      mimeType: "image/webp",
    });
  });

  it("maps video/* to VIDEO", async () => {
    await expect(sniff("video/mp4")).resolves.toEqual({
      contentType: "VIDEO",
      mimeType: "video/mp4",
    });
  });

  it("maps audio/* to AUDIO and application/pdf to PDF", async () => {
    await expect(sniff("audio/mpeg")).resolves.toEqual({
      contentType: "AUDIO",
      mimeType: "audio/mpeg",
    });
    await expect(sniff("application/pdf")).resolves.toEqual({
      contentType: "PDF",
      mimeType: "application/pdf",
    });
  });

  it("maps everything else to WEB, lowercased and without parameters", async () => {
    await expect(sniff("Text/HTML; charset=utf-8")).resolves.toEqual({
      contentType: "WEB",
      mimeType: "text/html",
    });
  });

  it("returns WEB with a null mime type when the HEAD fails", async () => {
    await expect(
      sniffContentTypeFromHeadWithFetch("https://x.test/thing", async () => {
        throw new Error("down");
      }),
    ).resolves.toEqual({ contentType: "WEB", mimeType: null });
  });
});
