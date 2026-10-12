import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ default: { link: {} } }));
vi.mock("@/lib/entitlements", () => ({
  assertCanSaveLink: vi.fn(),
  insertWithinSaveLimit: vi.fn(),
}));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastLinksChanged: vi.fn() }));
vi.mock("@/lib/folders", () => ({
  assertFolderOwned: vi.fn(),
  FolderNotFoundError: class FolderNotFoundError extends Error {},
}));
vi.mock("@/lib/safe-outbound-fetch", () => ({
  safeFetch: vi.fn(),
  limitReadableStreamByBytes: vi.fn((stream: ReadableStream) => stream),
}));

const { safeFetch } = await import("@/lib/safe-outbound-fetch");
const { resolveLinkFromUrl, scrapeLinkMetadata } = await import("./links");

const PAGE_HTML =
  '<html><head><meta property="og:title" content="A page">' +
  '<meta property="og:image" content="https://cdn.example.com/cover.png">' +
  "</head><body></body></html>";

/** A response for whatever the lookup asks: pages are HTML, the cover is an image. */
function respond(input: string | URL): Response {
  const url = String(input);
  if (url.endsWith("cover.png")) {
    return new Response(null, { headers: { "content-type": "image/png" } });
  }
  if (url.includes("youtube.com/oembed")) {
    return new Response(JSON.stringify({ title: "A video" }), {
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(PAGE_HTML, { headers: { "content-type": "text/html" } });
}

/** Every `signal` the lookup handed to the outbound fetch. */
function usedSignals(): AbortSignal[] {
  return vi
    .mocked(safeFetch)
    .mock.calls.map((call) => call[1]?.signal)
    .filter((signal): signal is AbortSignal => signal instanceof AbortSignal);
}

describe("a lookup's cancellation signal", () => {
  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(safeFetch).mockImplementation(async (input) => respond(input));
  });

  it.each([
    ["a web page (sniff, page fetch and cover probe)", "https://example.com/post", 3],
    ["a PDF", "https://example.com/files/doc.pdf", 1],
    ["a YouTube video", "https://www.youtube.com/watch?v=abc123", 1],
  ])("reaches every outbound request for %s", async (_label, url, minCalls) => {
    const outer = new AbortController();

    await resolveLinkFromUrl(url, { signal: outer.signal });

    const signals = usedSignals();
    expect(signals.length).toBeGreaterThanOrEqual(minCalls);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    outer.abort();
    // Every request, whichever step made it, is cancelled with the lookup.
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("still gives each request its own timeout when no signal is passed", async () => {
    await resolveLinkFromUrl("https://example.com/post");
    const signals = usedSignals();
    expect(signals.length).toBeGreaterThanOrEqual(3);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });

  it("scrapeLinkMetadata takes the signal too", async () => {
    const outer = new AbortController();
    await scrapeLinkMetadata("https://example.com/post", {
      signal: outer.signal,
    });
    const signals = usedSignals();
    expect(signals.length).toBeGreaterThanOrEqual(2);
    outer.abort();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
