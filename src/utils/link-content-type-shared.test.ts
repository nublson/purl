import { describe, expect, it, vi } from "vitest";
import {
  detectContentTypeWithFetch,
  type HeadFetchFn,
} from "./link-content-type-shared";

describe("detectContentTypeWithFetch signal", () => {
  function headFetch() {
    return vi.fn<HeadFetchFn>(
      async () => new Response(null, { headers: { "content-type": "text/html" } }),
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
    ).resolves.toBe("YOUTUBE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
