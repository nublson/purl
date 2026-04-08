import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(async (cb: () => void | Promise<void>) => {
      await cb();
    }),
  };
});

vi.mock("@/lib/ingest-pdf", () => ({
  ingestPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ingest-audio", () => ({
  ingestAudio: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ingest-web", () => ({
  ingestWeb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ingest-youtube", () => ({
  ingestYoutube: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock("@/lib/prisma", () => ({
  default: {
    link: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("open-graph-scraper", () => ({
  default: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const ogs = (await import("open-graph-scraper")).default;
const { ingestPdf } = await import("@/lib/ingest-pdf");
const { ingestAudio } = await import("@/lib/ingest-audio");
const { ingestWeb } = await import("@/lib/ingest-web");
const { ingestYoutube } = await import("@/lib/ingest-youtube");
const {
  createLink,
  refreshLink,
  reingestLink,
  readLink,
  updateLink,
  deleteLink,
  scrapeLinkMetadata,
  UnauthorizedError,
} = await import("./links");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };
const CREATED_AT = new Date("2025-06-15T10:00:00Z");

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
    ingestStatus:
      | "PENDING"
      | "PROCESSING"
      | "COMPLETED"
      | "FAILED"
      | "SKIPPED";
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
    ingestStatus: overrides.ingestStatus ?? "COMPLETED",
    createdAt: overrides.createdAt ?? CREATED_AT,
    userId: overrides.userId ?? "user-123",
  };
}

function mockOgsSuccess(
  overrides: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: Array<{ url: string }>;
    favicon?: string;
  } = {},
) {
  vi.mocked(ogs).mockResolvedValue({
    error: false,
    result: {
      ogTitle: "Example Domain",
      ogDescription: undefined,
      ogImage: undefined,
      favicon: undefined,
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
          "content-disposition": 'attachment; filename="Annual-Report-2024.pdf"',
        },
      }),
    );
    const result = await scrapeLinkMetadata(
      "https://example.com/download.pdf",
    );
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

describe("scrapeLinkMetadata – YouTube branch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(ogs).mockReset();
  });

  it("returns oEmbed title, author as description, and thumbnail for YouTube URLs", async () => {
    fetchSpy.mockResolvedValue(
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
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    mockOgsSuccess({ ogTitle: "OGS Fallback Title" });
    const result = await scrapeLinkMetadata(
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(result.title).toBe("OGS Fallback Title");
    expect(ogs).toHaveBeenCalled();
  });

  it("falls back to OGS when the oEmbed title is empty", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ title: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
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
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
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
    vi.mocked(ingestPdf).mockReset();
    vi.mocked(ingestAudio).mockReset();
    vi.mocked(ingestWeb).mockReset();
    vi.mocked(ingestYoutube).mockReset();
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
      ingestStatus: "PENDING",
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
        ingestStatus: "PENDING",
      },
    });
    expect(result).toEqual(refreshed);
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

  it("triggers ingestWeb after creating a WEB link", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const row = makeRow({ contentType: "WEB" });
    vi.mocked(prisma.link.create).mockResolvedValue(row as never);
    vi.mocked(ingestWeb).mockResolvedValue(undefined);

    await createLink("https://example.com/article");

    expect(vi.mocked(ingestWeb)).toHaveBeenCalledWith({
      linkId: row.id,
      url: row.url,
    });
    expect(vi.mocked(ingestPdf)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestAudio)).not.toHaveBeenCalled();
  });

  it("triggers ingestAudio after creating an AUDIO link", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const row = makeRow({
      url: "https://example.com/episode.mp3",
      contentType: "AUDIO",
    });
    vi.mocked(prisma.link.create).mockResolvedValue(row as never);
    vi.mocked(ingestAudio).mockResolvedValue(undefined);

    await createLink("https://example.com/episode.mp3");

    expect(vi.mocked(ingestAudio)).toHaveBeenCalledWith({
      linkId: row.id,
      url: row.url,
    });
    expect(vi.mocked(ingestPdf)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestWeb)).not.toHaveBeenCalled();
  });

  it("triggers ingestPdf after creating a PDF link", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const row = makeRow({
      url: "https://example.com/report.pdf",
      contentType: "PDF",
    });
    vi.mocked(prisma.link.create).mockResolvedValue(row as never);
    vi.mocked(ingestPdf).mockResolvedValue(undefined);

    await createLink("https://example.com/report.pdf");

    expect(vi.mocked(ingestPdf)).toHaveBeenCalledWith({
      linkId: row.id,
      url: row.url,
    });
    expect(vi.mocked(ingestAudio)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestWeb)).not.toHaveBeenCalled();
  });

  it("triggers ingestYoutube after creating a YOUTUBE link", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    const row = makeRow({
      url: "https://youtu.be/dQw4w9WgXcQ",
      contentType: "YOUTUBE",
    });
    vi.mocked(prisma.link.create).mockResolvedValue(row as never);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ title: "Rick Roll", author_name: "Rick Astley" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createLink("https://youtu.be/dQw4w9WgXcQ");

    expect(vi.mocked(ingestYoutube)).toHaveBeenCalledWith({
      linkId: row.id,
      url: row.url,
    });
    expect(vi.mocked(ingestPdf)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestAudio)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestWeb)).not.toHaveBeenCalled();
  });

  it("re-triggers ingestWeb when a duplicate WEB link is bumped", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const existing = makeRow({ contentType: "WEB" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const bumped = makeRow({ contentType: "WEB", createdAt: new Date() });
    vi.mocked(prisma.link.update).mockResolvedValue(bumped as never);
    vi.mocked(ingestWeb).mockResolvedValue(undefined);

    await createLink("https://example.com");

    expect(vi.mocked(ingestWeb)).toHaveBeenCalledWith({
      linkId: bumped.id,
      url: bumped.url,
    });
    expect(vi.mocked(prisma.link.create)).not.toHaveBeenCalled();
  });

  it("re-triggers ingestAudio when a duplicate AUDIO link is bumped", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const existing = makeRow({
      url: "https://example.com/ep.mp3",
      contentType: "AUDIO",
    });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const bumped = makeRow({
      url: "https://example.com/ep.mp3",
      contentType: "AUDIO",
      createdAt: new Date(),
    });
    vi.mocked(prisma.link.update).mockResolvedValue(bumped as never);
    vi.mocked(ingestAudio).mockResolvedValue(undefined);

    await createLink("https://example.com/ep.mp3");

    expect(vi.mocked(ingestAudio)).toHaveBeenCalledWith({
      linkId: bumped.id,
      url: bumped.url,
    });
    expect(vi.mocked(prisma.link.create)).not.toHaveBeenCalled();
  });
});

// ─── refreshLink ─────────────────────────────────────────────────────────────

describe("refreshLink", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(ingestPdf).mockReset();
    vi.mocked(ingestAudio).mockReset();
    vi.mocked(ingestWeb).mockReset();
    vi.mocked(ingestYoutube).mockReset();
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
    await expect(refreshLink("link-1")).rejects.toThrow(UnauthorizedError);
  });

  it("returns null when the link does not exist or is not owned by the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await refreshLink("link-1");

    expect(result).toBeNull();
    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
  });

  it("overwrites all scraped fields, bumps createdAt, and dispatches ingest", async () => {
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
      ingestStatus: "PENDING",
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

    const result = await refreshLink("link-1");

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
        ingestStatus: "PENDING",
      },
    });
    expect(vi.mocked(ingestYoutube)).toHaveBeenCalledWith({
      linkId: refreshed.id,
      url: refreshed.url,
    });
    expect(result).toEqual(refreshed);
  });
});

// ─── reingestLink ────────────────────────────────────────────────────────────

describe("reingestLink", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(ingestPdf).mockReset();
    vi.mocked(ingestAudio).mockReset();
    vi.mocked(ingestWeb).mockReset();
    vi.mocked(ingestYoutube).mockReset();
    vi.mocked(ogs).mockReset();
  });

  it("throws UnauthorizedError when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(reingestLink("link-1")).rejects.toThrow(UnauthorizedError);
  });

  it("returns null when the link does not exist or is not owned by the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    const result = await reingestLink("link-1");

    expect(result).toBeNull();
    expect(vi.mocked(prisma.link.update)).not.toHaveBeenCalled();
  });

  it("only sets ingestStatus to PENDING and dispatches ingest without re-scraping metadata", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const existing = makeRow({
      url: "https://storage.example/bucket/177836f2-a9b8-4c1d-9e0f-abc123/resume.pdf",
      title: "resume",
      description: "My CV",
      contentType: "PDF",
      ingestStatus: "FAILED",
    });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const updated = { ...existing, ingestStatus: "PENDING" as const };
    vi.mocked(prisma.link.update).mockResolvedValue(updated as never);

    const result = await reingestLink("link-1");

    expect(vi.mocked(prisma.link.update)).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "PENDING" },
    });
    expect(vi.mocked(ogs)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestPdf)).toHaveBeenCalledWith({
      linkId: updated.id,
      url: updated.url,
    });
    expect(result).toEqual(updated);
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
      ingestStatus: "COMPLETED",
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
    vi.mocked(ingestPdf).mockReset();
    vi.mocked(ingestAudio).mockReset();
    vi.mocked(ingestWeb).mockReset();
    vi.mocked(ingestYoutube).mockReset();
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

  it("dispatches ingest for the new contentType when URL changes", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const existing = makeRow({
      url: "https://example.com/article",
      contentType: "WEB",
    });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(existing as never);
    const updated = makeRow({
      url: "https://example.com/episode.mp3",
      contentType: "AUDIO",
    });
    vi.mocked(prisma.link.update).mockResolvedValue(updated as never);
    vi.mocked(ingestAudio).mockResolvedValue(undefined);

    await updateLink("link-1", { url: "https://example.com/episode.mp3" });

    expect(vi.mocked(ingestAudio)).toHaveBeenCalledWith({
      linkId: updated.id,
      url: updated.url,
    });
    expect(vi.mocked(ingestPdf)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestWeb)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestYoutube)).not.toHaveBeenCalled();
  });

  it("does not dispatch ingest when only title changes", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const row = makeRow({ url: "https://example.com/article", contentType: "WEB" });
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.link.update).mockResolvedValue({
      ...row,
      title: "Updated title",
    } as never);

    await updateLink("link-1", { title: "Updated title" });

    expect(vi.mocked(ingestPdf)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestAudio)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestWeb)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestYoutube)).not.toHaveBeenCalled();
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
    vi.mocked(
      prisma.link.delete as ReturnType<typeof vi.fn>,
    ).mockResolvedValue(row as never);

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
