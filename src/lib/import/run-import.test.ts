import { afterEach, describe, expect, it, vi } from "vitest";
import { linksOriginHeaders } from "@/lib/links-origin";
import type { ImportItem, ImportLinksResult } from "./types";
import { runImport } from "./run-import";

const empty: ImportLinksResult = {
  imported: 0,
  duplicates: 0,
  invalid: 0,
  overLimit: 0,
  foldersCreated: 0,
  unfiledForFolderLimit: 0,
  limitReached: false,
};

function items(n: number): ImportItem[] {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: `Item ${i}`,
    folder: i % 2 === 0 ? "Even" : null,
    createdAt: i === 0 ? new Date("2024-01-02T03:04:05.000Z") : null,
  }));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runImport", () => {
  it("sends 200-link chunks, sums the totals and reports progress", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ...empty, imported: 10, duplicates: 1, foldersCreated: 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onProgress = vi.fn();

    const outcome = await runImport(items(450), { onProgress });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      (call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).links.length,
    );
    expect(sizes).toEqual([200, 200, 50]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/links/import");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      ...linksOriginHeaders,
    });
    const first = JSON.parse(init.body as string).links;
    expect(first[0].createdAt).toBe("2024-01-02T03:04:05.000Z");
    expect(first[1].createdAt).toBeNull();

    expect(outcome.stopped).toBe("done");
    expect(outcome.totals).toEqual({
      ...empty,
      imported: 30,
      duplicates: 3,
      foldersCreated: 6,
    });
    expect(onProgress.mock.calls).toEqual([
      [200, 450],
      [400, 450],
      [450, 450],
    ]);
  });

  it("stops before the next chunk when the limit is reached", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ...empty, imported: 5, overLimit: 3, limitReached: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await runImport(items(450));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.stopped).toBe("limit");
    expect(outcome.totals.imported).toBe(5);
    expect(outcome.totals.limitReached).toBe(true);
  });

  it("reports a 429 as a rate-limit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Too many requests" }, 429)),
    );

    const outcome = await runImport(items(10));

    expect(outcome.stopped).toBe("error");
    expect(outcome.error).toEqual({
      status: 429,
      message: "Too many requests. Wait a minute and try again.",
    });
  });

  it("uses the server's message for other failures, keeping earlier totals", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...empty, imported: 4 }))
      .mockResolvedValueOnce(jsonResponse({ error: "Bad links" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await runImport(items(250));

    expect(outcome.stopped).toBe("error");
    expect(outcome.error).toEqual({ status: 400, message: "Bad links" });
    expect(outcome.totals.imported).toBe(4);
  });

  it("falls back to a generic message when the failure has no JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );

    const outcome = await runImport(items(5));

    expect(outcome.error).toEqual({
      status: 500,
      message: "Something went wrong. Try again.",
    });
  });

  it("reports a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const outcome = await runImport(items(5));

    expect(outcome.stopped).toBe("error");
    expect(outcome.error?.message).toBe(
      "Couldn’t reach Purl. Check your connection and try again.",
    );
  });

  it("stops between chunks when the signal is aborted", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      return jsonResponse({ ...empty, imported: 7 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await runImport(items(450), { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.stopped).toBe("aborted");
    expect(outcome.totals.imported).toBe(7);
  });

  it("treats an AbortError from fetch as aborted, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
    );

    const outcome = await runImport(items(5));

    expect(outcome.stopped).toBe("aborted");
    expect(outcome.error).toBeUndefined();
  });
});
