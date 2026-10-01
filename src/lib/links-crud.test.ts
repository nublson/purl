import * as safeOutbound from "@/lib/safe-outbound-fetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realSafeFetch = safeOutbound.safeFetch;

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    link: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // insertWithinSaveLimit runs its callback against the same mocked client.
  client.$transaction.mockImplementation(
    async (cb: (tx: typeof client) => unknown) => cb(client),
  );
  return { default: client };
});

vi.mock("open-graph-scraper", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/folders", () => ({
  assertFolderOwned: vi.fn(),
  FolderNotFoundError: class FolderNotFoundError extends Error {
    readonly name = "FolderNotFoundError";
  },
}));

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const ogs = (await import("open-graph-scraper")).default;
const { assertFolderOwned, FolderNotFoundError } = await import("@/lib/folders");
const { SaveLimitError } = await import("@/lib/entitlements");
const { MAX_SAVED_LINKS } = await import("@/lib/limits");
const {
  createLink,
  createLinkForUser,
  readLink,
  updateLink,
  updateLinkForUser,
  deleteLink,
  moveLinkToFolder,
  scrapeLinkMetadata,
  UnauthorizedError,
} = await import("./links");

const MOCK_SESSION = { user: { id: "user-123", username: "user-123" }, session: {} };
const CREATED_AT = new Date("2025-06-15T10:00:00Z");

function mockUnderSaveLimit() {
  vi.mocked(prisma.link.count).mockResolvedValue(0);
}

function makeRow(
  overrides: Partial<{
    id: string;
    url: string;
    title: string;
    description: string | null;
    favicon: string;
    thumbnail: string | null;
    domain: string;
    contentType: "WEB" | "YOUTUBE" | "PDF" | "AUDIO";
    createdAt: Date;
    userId: string;
    folderId: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "link-1",
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    domain: overrides.domain ?? "example.com",
    description: overrides.description ?? null,
    thumbnail: overrides.thumbnail ?? null,
    contentType: overrides.contentType ?? "WEB",
    createdAt: overrides.createdAt ?? CREATED_AT,
    userId: overrides.userId ?? "user-123",
    folderId: overrides.folderId ?? null,
  };
}

function mockOgsSuccess(
  overrides: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: Array<{ url: string }>;
    twitterTitle?: string;
    twitterDescription?: string;
    twitterImage?: Array<{ url: string }>;
    favicon?: string;
    ogUrl?: string;
  } = {},
) {
  vi.mocked(ogs).mockResolvedValue({
    error: false,
    result: {
      ogTitle: "Example Domain",
      ogDescription: undefined,
      ogImage: undefined,
      twitterTitle: undefined,
      twitterDescription: undefined,
      twitterImage: undefined,
      favicon: undefined,
      ogUrl: undefined,
      ...overrides,
    },
    html: "",
    response: {} as Response,
  } as Awaited<ReturnType<typeof ogs>>);
}

// ─── scrapeLinkMetadata ───────────────────────────────────────────────────────

describe("scrapeLinkMetadata – PDF branch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns size in bytes when content-length is below 1 KB", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-length": "500" },
      }),
    );
    const result = await scrapeLinkMetadata("https://example.com/doc.pdf");
    expect(result.description).toBe("PDF Document - 500 B");
    expect(ogs).not.toHaveBeenCalled();
  });

  it("returns size in KB (rounded) for files between 1 KB and 1 MB", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-length": String(2 * 1024) },
      }),
    );
    const result = await scrapeLinkMetadata("https://example.com/report.pdf");
    expect(result.description).toBe("PDF Document - 2 KB");
  });

  it("returns size in MB (one decimal) for files ≥ 1 MB", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-length": String(1.5 * 1024 * 1024) },
      }),
    );
    const result = await scrapeLinkMetadata("https://example.com/book.pdf");
    expect(result.description).toBe("PDF Document - 1.5 MB");
  });

  it("omits size and returns 'PDF Document' when content-length header is absent", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const result = await scrapeLinkMetadata("https://example.com/nodoc.pdf");
    expect(result.description).toBe("PDF Document");
  });

  it("omits size when content-length is zero or negative", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-length": "0" },
      }),
    );
    const result = await scrapeLinkMetadata("https://example.com/empty.pdf");
    expect(result.description).toBe("PDF Document");
  });

  it("derives title from URL filename, stripping .pdf and normalising hyphens", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const result = await scrapeLinkMetadata(
      "https://example.com/my-annual-report.pdf",
    );
    expect(result.title).toBe("my annual report");
  });

  it("decodes percent-encoded characters in PDF filename", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const result = await scrapeLinkMetadata(
      "https://example.com/my%20document.pdf",
    );
    expect(result.title).toBe("my document");
  });

  it("falls back to domain as title when URL path has no meaningful filename", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    // Pathname ends with ".pdf" but after stripping .pdf and normalising, title would be empty
    const result = await scrapeLinkMetadata("https://example.com/.pdf");
    expect(result.title).toBe("example.com");
  });

  it("prefers content-disposition filename over URL-derived title and strips .pdf", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "content-disposition":
            'attachment; filename="Annual-Report-2024.pdf"',
        },
      }),
    );
    const result = await scrapeLinkMetadata("https://example.com/download.pdf");
    expect(result.title).toBe("Annual-Report-2024");
  });

  it("always sets thumbnail to null and favicon to the Google favicon URL", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const result = await scrapeLinkMetadata("https://example.com/file.pdf");
    expect(result.thumbnail).toBeNull();
    expect(result.favicon).toContain("google.com/s2/favicons");
    expect(result.favicon).toContain("example.com");
  });

  it("still returns metadata even when the HEAD fetch throws", async () => {
    fetchSpy.mockRejectedValue(new Error("Network timeout"));
    const result = await scrapeLinkMetadata("https://example.com/crash.pdf");
    expect(result.title).toBe("crash");
    expect(result.description).toBe("PDF Document");
  });
});

function hrefFromSafeFetchInput(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("scrapeLinkMetadata – YouTube branch", () => {
  let safeFetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    safeFetchSpy = vi.spyOn(safeOutbound, "safeFetch");
  });

  afterEach(() => {
    safeFetchSpy.mockRestore();
    vi.mocked(ogs).mockReset();
  });

  it("returns oEmbed title, author as description, and thumbnail for YouTube URLs", async () => {
    safeFetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "My Video",
          author_name: "Some Channel",
          thumbnail_url: "https://img.youtube.com/vi/abc/hqdefault.jpg",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await scrapeLinkMetadata(
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(result.title).toBe("My Video");
    expect(result.description).toBe("Some Channel");
    expect(result.thumbnail).toBe(
      "https://img.youtube.com/vi/abc/hqdefault.jpg",
    );
    expect(ogs).not.toHaveBeenCalled();
  });

  it("falls back to OGS when the oEmbed response is not ok", async () => {
    safeFetchSpy.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = hrefFromSafeFetchInput(input);
        if (href.includes("youtube.com/oembed")) {
          return new Response(null, { status: 404 });
        }
        if (href.includes("youtube.com/watch")) {
          return new Response("<html><head><title>OG</title></head></html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return realSafeFetch(input as string | URL, init!);
      },
    );
    mockOgsSuccess({ ogTitle: "OGS Fallback Title" });
    const result = await scrapeLinkMetadata(
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(result.title).toBe("OGS Fallback Title");
    expect(ogs).toHaveBeenCalled();
  });

  it("falls back to OGS when the oEmbed title is empty", async () => {
    safeFetchSpy.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = hrefFromSafeFetchInput(input);
        if (href.includes("youtube.com/oembed")) {
          return new Response(JSON.stringify({ title: "" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (href.includes("youtube.com/watch")) {
          return new Response("<html><head><title>OG</title></head></html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return realSafeFetch(input as string | URL, init!);
      },
    );
    mockOgsSuccess({ ogTitle: "OGS Title" });
    const result = await scrapeLinkMetadata(
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(ogs).toHaveBeenCalled();
    expect(result.title).toBe("OGS Title");
  });
});

describe("scrapeLinkMetadata – web/OGS branch", () => {
  let safeFetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    safeFetchSpy = vi.spyOn(safeOutbound, "safeFetch");
    safeFetchSpy.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = hrefFromSafeFetchInput(input);
        const method = init?.method ?? "GET";

        if (method === "HEAD") {
          if (href === "https://example.com/img.jpg") {
            return new Response(null, {
              status: 200,
              headers: { "content-type": "image/jpeg" },
            });
          }
          if (href === "https://example.com/bogus.jpg") {
            return new Response(null, {
              status: 200,
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          }
          if (href === "https://example.com/sniff.jpg") {
            return new Response(null, { status: 405 });
          }
          return new Response(null, { status: 404 });
        }

        if (method === "GET" && href === "https://example.com/sniff.jpg") {
          const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
          return new Response(jpeg, {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          });
        }

        return new Response("<html><head></head><body></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    );
  });

  afterEach(() => {
    safeFetchSpy.mockRestore();
    vi.mocked(ogs).mockReset();
  });

  it("resolves relative favicon URLs to absolute", async () => {
    mockOgsSuccess({ favicon: "/favicon.ico" });
    vi.mocked(prisma.link.create).mockResolvedValue(makeRow() as never);
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.favicon).toBe("https://example.com/favicon.ico");
  });

  it("falls back to Google favicon URL when ogs returns no favicon", async () => {
    mockOgsSuccess({ favicon: undefined });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.favicon).toContain("google.com/s2/favicons");
  });

  it("returns ogDescription as description", async () => {
    mockOgsSuccess({ ogDescription: "A great page" });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.description).toBe("A great page");
  });

  it("returns null description when ogDescription is absent", async () => {
    mockOgsSuccess();
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.description).toBeNull();
  });

  it("returns first ogImage URL as thumbnail", async () => {
    mockOgsSuccess({
      ogImage: [{ url: "https://example.com/img.jpg" }],
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBe("https://example.com/img.jpg");
  });

  it("returns null thumbnail when HEAD reports a non-image Content-Type", async () => {
    mockOgsSuccess({
      ogImage: [{ url: "https://example.com/bogus.jpg" }],
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBeNull();
  });

  it("accepts thumbnail when HEAD is not allowed but GET body looks like JPEG", async () => {
    mockOgsSuccess({
      ogImage: [{ url: "https://example.com/sniff.jpg" }],
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBe("https://example.com/sniff.jpg");
  });

  it("returns null thumbnail when og:image is the page URL (not a real image)", async () => {
    mockOgsSuccess({
      ogImage: [{ url: "https://example.com/page" }],
      ogUrl: "https://example.com/page",
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBeNull();
  });

  it("returns null thumbnail when og:image matches page after trailing-slash normalization", async () => {
    mockOgsSuccess({
      ogImage: [{ url: "https://example.com/page/" }],
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBeNull();
  });

  it("returns null when relative og:image resolves to the same document URL", async () => {
    mockOgsSuccess({
      ogImage: [{ url: "/page" }],
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBeNull();
  });

  it("returns null thumbnail when no ogImage is present", async () => {
    mockOgsSuccess({ ogImage: undefined });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.thumbnail).toBeNull();
  });

  it("falls back to domain as title when ogs errors", async () => {
    vi.mocked(ogs).mockRejectedValue(new Error("Network error"));
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.title).toBe("example.com");
    expect(result.description).toBeNull();
    expect(result.thumbnail).toBeNull();
  });

  it("uses twitter:title / description / image when og:* tags are absent", async () => {
    mockOgsSuccess({
      ogTitle: undefined,
      ogDescription: undefined,
      ogImage: undefined,
      twitterTitle: "Twitter Card Title",
      twitterDescription: "Twitter card blurb",
      twitterImage: [{ url: "https://example.com/img.jpg" }],
    });
    const result = await scrapeLinkMetadata("https://example.com/page");
    expect(result.title).toBe("Twitter Card Title");
    expect(result.description).toBe("Twitter card blurb");
    expect(result.thumbnail).toBe("https://example.com/img.jpg");
  });

  it("passes only the HTML head to ogs for large documents", async () => {
    const body = "X".repeat(80_000);
    const html = `<html><head><meta property="og:title" content="Head Title"/></head><body>${body}</body></html>`;
    safeFetchSpy.mockResolvedValueOnce(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    mockOgsSuccess({ ogTitle: "Head Title" });

    const result = await scrapeLinkMetadata("https://example.com/huge");
    expect(result.title).toBe("Head Title");
    expect(ogs).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("</head>"),
      }),
    );
    const passedHtml = vi.mocked(ogs).mock.calls[0]?.[0]?.html as string;
    expect(passedHtml).not.toContain("XXXXX");
    expect(passedHtml.length).toBeLessThan(html.length);
  });
});

// ─── createLink ──────────────────────────────────────────────────────────────

describe("createLink", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.create).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(ogs).mockReset();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    mockOgsSuccess();
    mockUnderSaveLimit();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("throws UnauthorizedError when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(createLink("https://example.com")).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("throws UnauthorizedError when session has no user id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);
    await expect(createLink("https://example.com")).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("refreshes all scraped fields and returns existing link when URL already exists for user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const existing = makeRow({
      url: "https://youtu.be/dQw4w9WgXcQ",
      title: "Old title",
      description: "Old description",
      thumbnail: null,
      contentType: "WEB",
    });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const refreshed = makeRow({
      url: "https://youtu.be/dQw4w9WgXcQ",
      title: "Rick Roll",
      description: "Rick Astley",
      thumbnail: "https://img.youtube.com/vi/abc/hqdefault.jpg",
      contentType: "YOUTUBE",
      createdAt: new Date(),
    });
    vi.mocked(prisma.link.update).mockResolvedValue(refreshed as never);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Rick Roll",
          author_name: "Rick Astley",
          thumbnail_url: "https://img.youtube.com/vi/abc/hqdefault.jpg",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createLink("https://youtu.be/dQw4w9WgXcQ");

    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: {
        title: "Rick Roll",
        description: "Rick Astley",
        favicon: expect.stringContaining("google.com/s2/favicons"),
        thumbnail: "https://img.youtube.com/vi/abc/hqdefault.jpg",
        domain: "youtu.be",
        contentType: "YOUTUBE",
        createdAt: expect.any(Date),
        },
    });
    expect(result).toEqual({ ...refreshed, moved: false });
  });

  it("creates a new link with correct userId and WEB contentType for a regular URL", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.link.create).mockResolvedValue(makeRow() as never);

    await createLink("https://example.com");

    expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-123",
          contentType: "WEB",
          url: "https://example.com",
        }),
      }),
    );
  });

  it("stores a YouTube URL with contentType YOUTUBE", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const ytRow = makeRow({
      url: "https://youtu.be/dQw4w9WgXcQ",
      contentType: "YOUTUBE",
    });
    vi.mocked(prisma.link.create).mockResolvedValue(ytRow as never);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ title: "Rick Roll", author_name: "Rick Astley" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createLink("https://youtu.be/dQw4w9WgXcQ");

    expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentType: "YOUTUBE" }),
      }),
    );
  });

  it("stores a PDF URL with contentType PDF", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const pdfRow = makeRow({
      url: "https://example.com/doc.pdf",
      contentType: "PDF",
    });
    vi.mocked(prisma.link.create).mockResolvedValue(pdfRow as never);

    await createLink("https://example.com/doc.pdf");

    expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentType: "PDF" }),
      }),
    );
  });

  it("stores a Spotify URL with contentType WEB", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const audioRow = makeRow({
      url: "https://open.spotify.com/track/abc",
      contentType: "WEB",
    });
    vi.mocked(prisma.link.create).mockResolvedValue(audioRow as never);

    await createLink("https://open.spotify.com/track/abc");

    expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentType: "WEB" }),
      }),
    );
  });

  it("only queries links for the authenticated user when checking duplicates", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.link.create).mockResolvedValue(makeRow() as never);

    await createLink("https://example.com");

    expect(vi.mocked(prisma.link.findFirst)).toHaveBeenCalledWith({
      where: { userId: "user-123", url: "https://example.com" },
    });
  });

  it("throws SaveLimitError on the fast pre-check when already at the cap", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.count).mockResolvedValue(MAX_SAVED_LINKS);

    const err = await createLink("https://example.com").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SaveLimitError);
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(ogs).not.toHaveBeenCalled();
  });

  it("throws SaveLimitError without inserting when the cap fills during metadata work", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    let countCalls = 0;
    vi.mocked(prisma.link.count).mockImplementation(async () => {
      countCalls += 1;
      return countCalls === 1 ? MAX_SAVED_LINKS - 1 : MAX_SAVED_LINKS;
    });

    const err = await createLink("https://example.com").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SaveLimitError);
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(countCalls).toBeGreaterThanOrEqual(2);
  });

});

// ─── createLinkForUser – folder behavior ──────────────────────────────────────

describe("createLinkForUser – folders", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.create).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(prisma.link.count).mockReset();
    vi.mocked(ogs).mockReset();
    vi.mocked(assertFolderOwned).mockReset().mockResolvedValue(undefined);
    // No session is mocked in this describe block on purpose: the
    // existing-URL branch of createLinkForUser now resolves and writes
    // everything (metadata + folderId) scoped by the `existing` row it
    // already looked up via `{ userId, url }`, with no session lookup in
    // the path at all — this is what makes it safe for session-less
    // callers such as MCP.
    vi.mocked(auth.api.getSession).mockReset();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    mockOgsSuccess();
    mockUnderSaveLimit();
  });

  it("creates a new URL with the given folderId and moved: false", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const created = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.create).mockResolvedValue(created as never);

    const result = await createLinkForUser("user-123", "https://example.com", {
      folderId: "folder-1",
    });

    expect(vi.mocked(assertFolderOwned)).toHaveBeenCalledWith(
      "user-123",
      "folder-1",
    );
    expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ folderId: "folder-1" }),
      }),
    );
    expect(result.moved).toBe(false);
  });

  it("throws FolderNotFoundError for a foreign folderId and does not create the link", async () => {
    vi.mocked(assertFolderOwned).mockRejectedValue(new FolderNotFoundError());

    await expect(
      createLinkForUser("user-123", "https://example.com", {
        folderId: "foreign-folder",
      }),
    ).rejects.toThrow(FolderNotFoundError);
    expect(vi.mocked(prisma.link.create)).not.toHaveBeenCalled();
  });

  it("maps a Prisma P2003 (foreign key) error on a new-URL create to FolderNotFoundError", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    // assertFolderOwned passed, but the folder was deleted before the insert.
    vi.mocked(prisma.link.create).mockRejectedValue(
      Object.assign(new Error("Foreign key constraint failed"), {
        code: "P2003",
      }),
    );

    await expect(
      createLinkForUser("user-123", "https://example.com", {
        folderId: "folder-1",
      }),
    ).rejects.toThrow(FolderNotFoundError);
  });

  it("rethrows non-FK errors from a new-URL create unchanged", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const boom = Object.assign(new Error("boom"), { code: "P1001" });
    vi.mocked(prisma.link.create).mockRejectedValue(boom);

    await expect(
      createLinkForUser("user-123", "https://example.com", {
        folderId: "folder-1",
      }),
    ).rejects.toBe(boom);
  });

  it("moves an existing URL to a different folderId in a single update and returns moved: true", async () => {
    const existing = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const moved = makeRow({ folderId: "folder-2", title: "Refreshed" });
    vi.mocked(prisma.link.update).mockResolvedValue(moved as never);

    const result = await createLinkForUser("user-123", "https://example.com", {
      folderId: "folder-2",
    });

    expect(vi.mocked(assertFolderOwned)).toHaveBeenCalledWith(
      "user-123",
      "folder-2",
    );
    // Single write: the metadata bump and the folderId change land in one
    // prisma.link.update call, not two — a failure can't leave the row
    // refreshed in its old folder while the caller sees an error.
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: {
        title: expect.any(String),
        description: null,
        favicon: expect.any(String),
        thumbnail: null,
        domain: expect.any(String),
        contentType: "WEB",
        createdAt: expect.any(Date),
        folderId: "folder-2",
      },
    });
    expect(result.moved).toBe(true);
    expect(result.folderId).toBe("folder-2");
    // Risk (a): re-saving an existing (already-owned) link must never
    // re-check the save-limit cap — that only applies to brand-new links.
    expect(vi.mocked(prisma.link.count)).not.toHaveBeenCalled();
  });

  it("does not require a session to move an existing URL to a different folder (MCP path)", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const existing = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.link.update).mockResolvedValue(
      makeRow({ folderId: "folder-2" }) as never,
    );

    const result = await createLinkForUser("user-123", "https://example.com", {
      folderId: "folder-2",
    });

    expect(result.moved).toBe(true);
  });

  it("maps a Prisma P2003 (foreign key) error on the combined write to FolderNotFoundError", async () => {
    const existing = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    // assertFolderOwned passed, but the folder was deleted before the write.
    vi.mocked(prisma.link.update).mockRejectedValue(
      Object.assign(new Error("Foreign key constraint failed"), {
        code: "P2003",
      }),
    );

    await expect(
      createLinkForUser("user-123", "https://example.com", {
        folderId: "folder-2",
      }),
    ).rejects.toThrow(FolderNotFoundError);
  });

  it("re-saving an existing URL with no folderId keeps its folder and returns moved: false", async () => {
    const existing = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const refreshed = makeRow({ folderId: "folder-1", title: "Refreshed" });
    vi.mocked(prisma.link.update).mockResolvedValue(refreshed as never);

    const result = await createLinkForUser("user-123", "https://example.com");

    expect(vi.mocked(assertFolderOwned)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ folderId: expect.anything() }),
      }),
    );
    expect(result.moved).toBe(false);
    expect(result.folderId).toBe("folder-1");
  });

  it("re-saving an existing URL with the same folderId returns moved: false", async () => {
    const existing = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const refreshed = makeRow({ folderId: "folder-1", title: "Refreshed" });
    vi.mocked(prisma.link.update).mockResolvedValue(refreshed as never);

    const result = await createLinkForUser("user-123", "https://example.com", {
      folderId: "folder-1",
    });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledTimes(1);
    expect(result.moved).toBe(false);
  });
});

// ─── moveLinkToFolder ──────────────────────────────────────────────────────────

describe("moveLinkToFolder", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(assertFolderOwned).mockReset().mockResolvedValue(undefined);
  });

  it("returns null when the link is not found or not owned by the user", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await moveLinkToFolder("user-123", "link-1", "folder-1");

    expect(result).toBeNull();
    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
  });

  it("moves a link to a folder owned by the user", async () => {
    const existing = makeRow({ id: "link-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.link.update).mockResolvedValue(
      makeRow({ id: "link-1", folderId: "folder-1" }) as never,
    );

    const result = await moveLinkToFolder("user-123", "link-1", "folder-1");

    expect(vi.mocked(assertFolderOwned)).toHaveBeenCalledWith(
      "user-123",
      "folder-1",
    );
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { folderId: "folder-1" },
    });
    expect(result).not.toBeNull();
    // Regression: mapRowToLink previously dropped folderId, so the caller
    // (e.g. the PATCH route) could never see the moved-to folder.
    expect(result?.folderId).toBe("folder-1");
  });

  it("moves a link to null (un-foldering it)", async () => {
    const existing = makeRow({ id: "link-1", folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.link.update).mockResolvedValue(
      makeRow({ id: "link-1", folderId: null }) as never,
    );

    const result = await moveLinkToFolder("user-123", "link-1", null);

    expect(vi.mocked(assertFolderOwned)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { folderId: null },
    });
    expect(result).not.toBeNull();
    expect(result?.folderId).toBeNull();
  });

  it("rejects a foreign folderId with FolderNotFoundError and does not update", async () => {
    const existing = makeRow({ id: "link-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    vi.mocked(assertFolderOwned).mockRejectedValue(new FolderNotFoundError());

    await expect(
      moveLinkToFolder("user-123", "link-1", "foreign-folder"),
    ).rejects.toThrow(FolderNotFoundError);
    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
  });

  it("maps a Prisma P2003 (foreign key) error on the write to FolderNotFoundError", async () => {
    const existing = makeRow({ id: "link-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    // assertFolderOwned passed, but the folder was deleted before the write.
    vi.mocked(prisma.link.update).mockRejectedValue(
      Object.assign(new Error("Foreign key constraint failed"), {
        code: "P2003",
      }),
    );

    await expect(
      moveLinkToFolder("user-123", "link-1", "folder-1"),
    ).rejects.toThrow(FolderNotFoundError);
  });
});


// ─── readLink ─────────────────────────────────────────────────────────────────

describe("readLink", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
  });

  it("throws UnauthorizedError when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(readLink("link-1")).rejects.toThrow(UnauthorizedError);
  });

  it("returns null when the link does not exist or is not owned by the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await readLink("nonexistent-id");

    expect(result).toBeNull();
  });

  it("queries by both id and userId so users cannot access each other's links", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    await readLink("link-1");

    expect(vi.mocked(prisma.link.findFirst)).toHaveBeenCalledWith({
      where: { id: "link-1", userId: "user-123" },
    });
  });

  it("returns a fully mapped Link object when found", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow({
      id: "link-99",
      url: "https://news.example.com/article",
      title: "Big News",
      description: "A very important story",
      thumbnail: "https://example.com/thumb.jpg",
      contentType: "WEB",
    });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);

    const result = await readLink("link-99");

    expect(result).toMatchObject({
      id: "link-99",
      url: "https://news.example.com/article",
      title: "Big News",
      description: "A very important story",
      thumbnail: "https://example.com/thumb.jpg",
      contentType: "WEB",
    });
    // userId must not be leaked in the mapped Link shape
    expect(result).not.toHaveProperty("userId");
  });
});

// ─── updateLink ──────────────────────────────────────────────────────────────

describe("updateLink", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(ogs).mockReset();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    mockOgsSuccess();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("throws UnauthorizedError when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(updateLink("link-1", { title: "New" })).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("returns null when the link is not found or not owned by the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await updateLink("link-1", { title: "New title" });

    expect(result).toBeNull();
    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
  });

  it("updates only title when title is provided and URL did not change", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow();
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...row,
      title: "New title",
    } as never);

    await updateLink("link-1", { title: "New title" });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { title: "New title" },
    });
  });

  it("updates only description when description is set to null explicitly", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow({ description: "Old desc" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...row,
      description: null,
    } as never);

    await updateLink("link-1", { description: null });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { description: null },
    });
  });

  it("re-scrapes metadata and updates contentType when URL changes", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const existing = makeRow({ url: "https://example.com" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...existing,
      url: "https://youtu.be/dQw4w9WgXcQ",
      contentType: "YOUTUBE",
    } as never);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ title: "Rick Roll", author_name: "Rick Astley" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await updateLink("link-1", { url: "https://youtu.be/dQw4w9WgXcQ" });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://youtu.be/dQw4w9WgXcQ",
          contentType: "YOUTUBE",
        }),
      }),
    );
  });

  it("returns existing link without calling prisma.update when URL is unchanged and no other fields are provided", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow({ url: "https://example.com" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);

    const result = await updateLink("link-1", { url: "https://example.com" });

    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
    // Returns the existing row directly (no Link mapping applied here since it returns the DB row)
    expect(result).toBe(row);
  });

  it("treats a whitespace-only url as no URL change", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow();
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...row,
      title: "Updated",
    } as never);

    await updateLink("link-1", { url: "   ", title: "Updated" });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { title: "Updated" },
    });
  });
});

// ─── updateLinkForUser ───────────────────────────────────────────────────────

describe("updateLinkForUser", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(ogs).mockReset();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    mockOgsSuccess();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("scopes the lookup to the given user and returns null for a link it doesn't own", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await updateLinkForUser("user-123", "link-1", {
      title: "New",
      folderId: "folder-1",
    });

    expect(result).toBeNull();
    expect(vi.mocked(prisma.link.findFirst)).toHaveBeenCalledWith({
      where: { id: "link-1", userId: "user-123" },
    });
    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
    // Explicit user: no session lookup.
    expect(vi.mocked(auth.api.getSession)).not.toHaveBeenCalled();
  });

  it("writes the field edits and folderId in ONE update", async () => {
    const row = makeRow();
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...row,
      title: "New title",
      folderId: "folder-1",
    } as never);

    const result = await updateLinkForUser("user-123", "link-1", {
      title: "New title",
      folderId: "folder-1",
    });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { title: "New title", folderId: "folder-1" },
    });
    expect(result?.folderId).toBe("folder-1");
  });

  it("includes folderId: null to unfile alongside the edit", async () => {
    const row = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...row,
      description: null,
      folderId: null,
    } as never);

    await updateLinkForUser("user-123", "link-1", {
      description: null,
      folderId: null,
    });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { description: null, folderId: null },
    });
  });

  it("re-scrapes a changed URL and carries folderId in the same update", async () => {
    const existing = makeRow({ url: "https://example.com" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.link.update).mockResolvedValue(existing as never);

    await updateLinkForUser("user-123", "link-1", {
      url: "https://example.org/page",
      folderId: "folder-1",
    });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://example.org/page",
          domain: "example.org",
          folderId: "folder-1",
        }),
      }),
    );
  });

  it("leaves folderId out of the write when it isn't given", async () => {
    const row = makeRow({ folderId: "folder-1" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue(row as never);

    await updateLinkForUser("user-123", "link-1", { title: "T" });

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { title: "T" },
    });
  });

  it("maps a P2003 (folder deleted before the write) to FolderNotFoundError", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(makeRow() as never);
    vi.mocked(prisma.link.update).mockRejectedValue(
      Object.assign(new Error("Foreign key constraint failed"), {
        code: "P2003",
      }),
    );

    await expect(
      updateLinkForUser("user-123", "link-1", {
        title: "New title",
        folderId: "folder-1",
      }),
    ).rejects.toThrow(FolderNotFoundError);
  });
});

// ─── deleteLink ──────────────────────────────────────────────────────────────

describe("deleteLink", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.delete as ReturnType<typeof vi.fn>).mockReset();
  });

  it("throws UnauthorizedError when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(deleteLink("link-1")).rejects.toThrow(UnauthorizedError);
  });

  it("returns false when the link does not exist or is not owned by the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await deleteLink("link-1");

    expect(result).toBe(false);
    expect(prisma.link.delete).not.toHaveBeenCalled();
  });

  it("returns true and deletes the link when it belongs to the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow({ id: "link-42" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      row as never,
    );

    const result = await deleteLink("link-42");

    expect(result).toBe(true);
    expect(prisma.link.delete).toHaveBeenCalledWith({
      where: { id: "link-42" },
    });
  });

  it("queries by both id and userId so users cannot delete each other's links", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    await deleteLink("link-1");

    expect(vi.mocked(prisma.link.findFirst)).toHaveBeenCalledWith({
      where: { id: "link-1", userId: "user-123" },
    });
  });
});
