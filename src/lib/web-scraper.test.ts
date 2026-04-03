import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn(),
}));

vi.mock("jsdom", () => ({
  JSDOM: vi.fn(),
}));

const { Readability } = await import("@mozilla/readability");
const { JSDOM } = await import("jsdom");
const { scrapeWebContent, UnsupportedSpaError } = await import(
  "./web-scraper"
);

function makeFetchResponse(
  overrides: {
    ok?: boolean;
    status?: number;
    contentType?: string;
    contentLength?: string | null;
    body?: string;
  } = {},
) {
  const {
    ok = true,
    status = 200,
    contentType = "text/html; charset=utf-8",
    contentLength = null,
    body = "<html><body><p>Hello</p></body></html>",
  } = overrides;

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  if (contentLength !== null) headers.set("content-length", contentLength);

  return { ok, status, headers, text: async () => body };
}

/** Sets up JSDOM mock to return the given document stub. */
function mockJsdom(documentStub: object = {}) {
  const doc = documentStub;
  vi.mocked(JSDOM).mockImplementation(
    class {
      window = { document: doc };
    } as never,
  );
}

/** Sets up Readability mock to return the given article from parse(). */
function mockReadability(article: { textContent?: string } | null) {
  vi.mocked(Readability).mockImplementation(function () {
    return { parse: () => article };
  } as never);
}

// ─── SPA blocking ────────────────────────────────────────────────────────────

describe("scrapeWebContent – SPA blocking", () => {
  const SPA_URLS = [
    "https://x.com/user/status/123",
    "https://www.twitter.com/user",
    "https://instagram.com/p/abc",
    "https://www.facebook.com/photo",
    "https://threads.net/@user",
    "https://www.tiktok.com/@user/video/123",
    "https://linkedin.com/in/someone",
    "https://www.reddit.com/r/programming",
    "https://open.spotify.com/track/abc",
    "https://music.youtube.com/watch?v=abc123",
    "https://music.apple.com/us/album/test/123456789",
  ];

  for (const url of SPA_URLS) {
    it(`throws UnsupportedSpaError for ${new URL(url).hostname}`, async () => {
      await expect(scrapeWebContent(url)).rejects.toThrow(UnsupportedSpaError);
    });
  }

  it("does not block a non-SPA URL with a similar domain fragment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeFetchResponse()));
    mockJsdom({});
    mockReadability({ textContent: "non-spa content" });

    await expect(
      scrapeWebContent("https://notreddit.com/article"),
    ).resolves.toBeTruthy();
    vi.unstubAllGlobals();
  });
});

// ─── HTTP error handling ──────────────────────────────────────────────────────

describe("scrapeWebContent – HTTP error handling", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeFetchResponse({ ok: false, status: 403 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when the HTTP response is not ok", async () => {
    await expect(scrapeWebContent("https://example.com/page")).rejects.toThrow(
      "Failed to fetch page (403)",
    );
  });
});

// ─── content-type guard ───────────────────────────────────────────────────────

describe("scrapeWebContent – content-type guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when the response is JSON, not HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({ contentType: "application/json" }),
      ),
    );

    await expect(
      scrapeWebContent("https://api.example.com/data"),
    ).rejects.toThrow("URL did not return an HTML document.");
  });

  it("throws when the response is plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({ contentType: "text/plain" }),
      ),
    );

    await expect(
      scrapeWebContent("https://example.com/readme.txt"),
    ).rejects.toThrow("URL did not return an HTML document.");
  });

  it("accepts application/xhtml+xml as a valid HTML content-type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({ contentType: "application/xhtml+xml" }),
      ),
    );
    mockJsdom({});
    mockReadability({ textContent: "xhtml content" });

    await expect(
      scrapeWebContent("https://example.com/page.xhtml"),
    ).resolves.toBe("xhtml content");
    vi.unstubAllGlobals();
  });
});

// ─── size limit enforcement ───────────────────────────────────────────────────

describe("scrapeWebContent – size limit enforcement", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when content-length header exceeds 5 MB", async () => {
    const sixMb = 6 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({ contentLength: String(sixMb) }),
      ),
    );

    await expect(
      scrapeWebContent("https://example.com/huge"),
    ).rejects.toThrow("Web page exceeds maximum size");
  });

  it("throws when the downloaded body exceeds 5 MB even without content-length header", async () => {
    const body = "x".repeat(5 * 1024 * 1024 + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({ contentLength: null, body }),
      ),
    );

    await expect(
      scrapeWebContent("https://example.com/big"),
    ).rejects.toThrow("Web page exceeds maximum size");
  });

  it("does not throw when content-length is exactly 5 MB", async () => {
    const fiveMb = 5 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({ contentLength: String(fiveMb) }),
      ),
    );
    mockJsdom({});
    mockReadability({ textContent: "article text" });

    await expect(
      scrapeWebContent("https://example.com/page"),
    ).resolves.toBeTruthy();
    vi.unstubAllGlobals();
  });
});

// ─── Readability extraction ───────────────────────────────────────────────────

describe("scrapeWebContent – Readability extraction", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeFetchResponse()));
    mockJsdom({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when Readability returns null (no readable content)", async () => {
    mockReadability(null);

    await expect(
      scrapeWebContent("https://example.com/page"),
    ).rejects.toThrow("Could not extract readable content from this page.");
  });

  it("returns cleaned text from the parsed article", async () => {
    mockReadability({ textContent: "  Hello\u00a0world\uFEFF  " });

    const result = await scrapeWebContent("https://example.com/article");

    // cleanWebText: strips BOM, replaces NBSP with space, collapses runs, trims
    expect(result).toBe("Hello world");
  });

  it("collapses internal whitespace runs in article text", async () => {
    mockReadability({ textContent: "word1   word2\t\tword3" });

    const result = await scrapeWebContent("https://example.com/article");

    expect(result).toBe("word1 word2 word3");
  });

  it("returns empty string when article has no textContent", async () => {
    mockReadability({ textContent: undefined });

    const result = await scrapeWebContent("https://example.com/blank");

    expect(result).toBe("");
  });
});
