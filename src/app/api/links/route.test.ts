import * as safeOutbound from "@/lib/safe-outbound-fetch";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, POST } from "./route";

const realSafeFetch = safeOutbound.safeFetch;

function hrefFromSafeFetchInput(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

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
      count: vi.fn(),
    },
  },
}));

vi.mock("open-graph-scraper", () => ({
  default: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import("@/lib/auth");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const prisma = (await import("@/lib/prisma")).default;
const ogs = (await import("open-graph-scraper")).default;
let fetchSpy: ReturnType<typeof vi.spyOn>;
let safeFetchSpy: ReturnType<typeof vi.spyOn>;

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };
const CREATED_AT = new Date("2025-06-15T10:00:00Z");

const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com",
  title: "Example Domain",
  description: null as string | null,
  favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
  thumbnail: null as string | null,
  domain: "example.com",
  contentType: "WEB" as const,
  createdAt: CREATED_AT,
  userId: "user-123",
};

function postRequest(body: unknown, origin?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) {
    headers.origin = origin;
  }
  return new NextRequest("http://localhost/api/links", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function optionsRequest(origin?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (origin) {
    headers.origin = origin;
  }
  return new NextRequest("http://localhost/api/links", {
    method: "OPTIONS",
    headers,
  });
}

function mockOgsSuccess(
  overrides: {
    ogTitle?: string;
    ogDescription?: string | null;
    ogImage?: Array<{ url: string }> | null;
    favicon?: string | null;
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

function mockOgsFailure() {
  vi.mocked(ogs).mockResolvedValue({
    error: true,
    result: undefined,
    html: "",
    response: {} as Response,
  } as unknown as Awaited<ReturnType<typeof ogs>>);
}

describe("POST /api/links", () => {
  beforeEach(() => {
    fetchSpy?.mockRestore();
    safeFetchSpy?.mockRestore();
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.create).mockReset();
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.link.count).mockResolvedValue(0);
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(ogs).mockReset();
    vi.mocked(broadcastLinksChanged).mockClear();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );
    safeFetchSpy = vi.spyOn(safeOutbound, "safeFetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) =>
        realSafeFetch(input as string | URL, init!),
    );
    mockOgsSuccess();
  });

  describe("authentication", () => {
    it("returns 401 when there is no session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);
      const res = await POST(postRequest({ url: "https://example.com" }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when session has no user id", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: {},
        session: {},
      } as never);
      const res = await POST(postRequest({ url: "https://example.com" }));
      expect(res.status).toBe(401);
    });
  });

  describe("save limit", () => {
    it("returns 403 LIMIT_REACHED once the account has 1,000 links", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.count).mockResolvedValue(1000);

      const res = await POST(postRequest({ url: "https://example.com" }));

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "You've reached the 1,000-link limit. Delete links you no longer need to save new ones.",
        code: "LIMIT_REACHED",
        feature: "SAVE_LIMIT",
      });
      expect(prisma.link.create).not.toHaveBeenCalled();
    });
  });

  describe("request body validation", () => {
    it("returns 400 when the request body is not valid JSON", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const req = new NextRequest("http://localhost/api/links", {
        method: "POST",
        body: "{{invalid json}}",
        headers: { "content-type": "application/json" },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    });

    it("returns 400 when url field is missing from body", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const res = await POST(postRequest({}));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid or missing URL" });
    });

    it("returns 400 when url is an empty string", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const res = await POST(postRequest({ url: "" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid or missing URL" });
    });

    it("returns 400 for malformed host without a valid domain", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const res = await POST(postRequest({ url: "example" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid or missing URL" });
    });

    it("returns 400 for ftp:// protocol", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const res = await POST(postRequest({ url: "ftp://example.com" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid or missing URL" });
    });

    it("returns 400 for javascript: protocol (XSS guard)", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const res = await POST(postRequest({ url: "javascript:alert(1)" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid or missing URL" });
    });

    it("accepts a url padded with whitespace and trims it before processing", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "  https://example.com  " }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ url: "https://example.com" }),
        }),
      );
    });
  });

  describe("successful link creation", () => {
    it("calls broadcastLinksChanged with the link owner id after create", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith("user-123", null);
    });

    it("returns 201 with the saved link data including scraped title", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      const res = await POST(postRequest({ url: "https://example.com" }));

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        id: "link-1",
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
        thumbnail: null,
        domain: "example.com",
        contentType: "WEB",
        createdAt: CREATED_AT.toISOString(),
      });
    });

    it("writes the authenticated user id to the database record", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "user-123" }),
        }),
      );
    });

    it("constructs Google favicon URL from the stripped domain", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "https://www.example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            favicon:
              "https://www.google.com/s2/favicons?domain=example.com&sz=64",
          }),
        }),
      );
    });

    it("serialises createdAt as ISO string in the response", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      const res = await POST(postRequest({ url: "https://example.com" }));
      const json = await res.json();

      expect(json.createdAt).toBe(CREATED_AT.toISOString());
    });

    it("when link already exists, refreshes scraped fields and returns 201 without creating duplicate", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const bumpedAt = new Date("2025-06-20T12:00:00Z");
      vi.mocked(prisma.link.findFirst).mockResolvedValue(MOCK_LINK as never);
      vi.mocked(prisma.link.update).mockResolvedValue({
        ...MOCK_LINK,
        createdAt: bumpedAt,
      } as never);

      const res = await POST(postRequest({ url: "https://example.com" }));

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        id: "link-1",
        url: "https://example.com",
        createdAt: bumpedAt.toISOString(),
      });
      expect(prisma.link.create).not.toHaveBeenCalled();
      expect(prisma.link.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "link-1" },
          data: expect.objectContaining({
            title: "Example Domain",
            contentType: "WEB",
            createdAt: expect.any(Date),
          }),
        }),
      );
      expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith("user-123", null);
    });

    it("uses YouTube oEmbed for youtu.be URLs and skips OG scraping", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      safeFetchSpy.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = hrefFromSafeFetchInput(input);
        if (href.includes("youtube.com/oembed")) {
          return new Response(
            JSON.stringify({
              title: "Never Gonna Give You Up",
              author_name: "Rick Astley",
              thumbnail_url:
                "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return realSafeFetch(input as string | URL, init!);
      },
      );
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://youtu.be/dQw4w9WgXcQ?t=43",
        title: "Never Gonna Give You Up",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        domain: "youtu.be",
        contentType: "YOUTUBE",
      } as never);

      const res = await POST(
        postRequest({ url: "https://youtu.be/dQw4w9WgXcQ?t=43" }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        url: "https://youtu.be/dQw4w9WgXcQ?t=43",
        contentType: "YOUTUBE",
      });
      expect(prisma.link.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://youtu.be/dQw4w9WgXcQ?t=43",
            contentType: "YOUTUBE",
            title: "Never Gonna Give You Up",
            thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            description: "Rick Astley",
          }),
        }),
      );
      expect(ogs).not.toHaveBeenCalled();
    });

    it("falls back to OG scraping when YouTube oEmbed returns non-2xx", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      safeFetchSpy.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = hrefFromSafeFetchInput(input);
        if (href.includes("youtube.com/oembed")) {
          return new Response(null, { status: 404 });
        }
        return realSafeFetch(input as string | URL, init!);
      },
      );
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://youtu.be/dQw4w9WgXcQ",
        title: "Example Domain",
        domain: "youtu.be",
        contentType: "YOUTUBE",
      } as never);

      await POST(postRequest({ url: "https://youtu.be/dQw4w9WgXcQ" }));

      expect(ogs).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.any(String),
          timeout: 8,
        }),
      );
    });

    it("stores Spotify URLs with WEB contentType using OG scraping", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://open.spotify.com/track/abc123",
        title: "Spotify Track",
        domain: "spotify.com",
        contentType: "WEB",
      } as never);

      const res = await POST(
        postRequest({ url: "https://open.spotify.com/track/abc123" }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        url: "https://open.spotify.com/track/abc123",
        contentType: "WEB",
      });
      expect(prisma.link.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://open.spotify.com/track/abc123",
            contentType: "WEB",
          }),
        }),
      );
      expect(ogs).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.any(String),
          timeout: 8,
        }),
      );
    });

    it("stores Apple Music URLs with WEB contentType", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://music.apple.com/us/album/test/123",
        title: "Apple Music Album",
        domain: "apple.com",
        contentType: "WEB",
      } as never);

      const res = await POST(
        postRequest({ url: "https://music.apple.com/us/album/test/123" }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        url: "https://music.apple.com/us/album/test/123",
        contentType: "WEB",
      });
      expect(prisma.link.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://music.apple.com/us/album/test/123",
            contentType: "WEB",
          }),
        }),
      );
    });

    it("stores YouTube Music URLs with WEB contentType", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://music.youtube.com/watch?v=abc123",
        title: "YouTube Music Track",
        domain: "youtube.com",
        contentType: "WEB",
      } as never);

      const res = await POST(
        postRequest({ url: "https://music.youtube.com/watch?v=abc123" }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        url: "https://music.youtube.com/watch?v=abc123",
        contentType: "WEB",
      });
      expect(prisma.link.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://music.youtube.com/watch?v=abc123",
            contentType: "WEB",
          }),
        }),
      );
    });

    it("stores PDF URLs with PDF contentType and skips OG scraping", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      fetchSpy.mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-length": "217220",
          },
        }),
      );
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://example.com/doc.pdf",
        title: "Example PDF",
        domain: "example.com",
        contentType: "PDF",
      } as never);

      const res = await POST(
        postRequest({ url: "https://example.com/doc.pdf" }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        url: "https://example.com/doc.pdf",
        contentType: "PDF",
      });
      expect(prisma.link.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://example.com/doc.pdf",
            contentType: "PDF",
          }),
        }),
      );
      expect(ogs).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://example.com/doc.pdf",
        expect.objectContaining({ method: "HEAD", redirect: "manual" }),
      );
    });

    it("stores derived PDF title and file-size description from HEAD metadata", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      fetchSpy.mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-length": "217220",
          },
        }),
      );
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        url: "https://example.com/course.pdf",
        title: "course",
        description: "PDF Document - 212 KB",
        contentType: "PDF",
      } as never);

      await POST(postRequest({ url: "https://example.com/course.pdf" }));

      expect(prisma.link.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: "PDF",
            title: "course",
            description: "PDF Document - 212 KB",
            thumbnail: null,
          }),
        }),
      );
    });
  });

  describe("metadata scraping fallback", () => {
    it("falls back to domain as title when ogs throws", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(ogs).mockRejectedValue(new Error("Network error"));
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "example.com",
      } as never);

      const res = await POST(postRequest({ url: "https://example.com" }));

      expect(res.status).toBe(201);
      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "example.com",
            description: null,
            thumbnail: null,
          }),
        }),
      );
    });

    it("falls back to domain as title when ogs returns error", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockOgsFailure();
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "example.com",
      } as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "example.com" }),
        }),
      );
    });

    it("falls back to domain when ogs result is null", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(ogs).mockResolvedValue({
        error: false,
        result: null,
        html: "",
        response: {} as Response,
      } as unknown as Awaited<ReturnType<typeof ogs>>);
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "example.com",
      } as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "example.com" }),
        }),
      );
    });

    it("falls back to domain when scraped title is only whitespace", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockOgsSuccess({ ogTitle: "   " });
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "example.com",
      } as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "example.com" }),
        }),
      );
    });

    it("normalises internal whitespace in the scraped title", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockOgsSuccess({ ogTitle: "  My   Noisy\n  Title  " });
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "My Noisy Title",
      } as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "My Noisy Title" }),
        }),
      );
    });

    it("truncates scraped titles longer than 500 characters to exactly 500", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const longTitle = "A".repeat(600);
      mockOgsSuccess({ ogTitle: longTitle });
      const truncatedTitle = "A".repeat(500);
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: truncatedTitle,
      } as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: truncatedTitle }),
        }),
      );
    });

    it("fetches HTML with User-Agent then passes html and timeout to ogs", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://example.com/",
        expect.objectContaining({
          redirect: "manual",
          headers: expect.objectContaining({
            "User-Agent":
              "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
          }),
        }),
      );
      expect(ogs).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.any(String),
          timeout: 8,
        }),
      );
    });
  });
});

describe("CORS /api/links", () => {
  describe("OPTIONS preflight", () => {
    it("returns 204 with credentialed CORS headers for chrome-extension origins", async () => {
      const origin = "chrome-extension://abcdefghijklmnop";
      const res = await OPTIONS(optionsRequest(origin));
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });

    it("omits CORS headers when Origin is not allowed", async () => {
      const res = await OPTIONS(optionsRequest("https://evil.example"));
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });

    it("omits CORS headers when Origin is missing", async () => {
      const res = await OPTIONS(optionsRequest());
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  describe("POST responses", () => {
    it("includes CORS headers on error responses for chrome-extension origins", async () => {
      const origin = "chrome-extension://extension-id-here";
      vi.mocked(auth.api.getSession).mockResolvedValue(null);
      const res = await POST(postRequest({ url: "https://example.com" }, origin));
      expect(res.status).toBe(401);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("omits CORS headers on POST when Origin is not allowed", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);
      const res = await POST(
        postRequest({ url: "https://example.com" }, "https://untrusted.example"),
      );
      expect(res.status).toBe(401);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  describe("ALLOWED_ORIGINS", () => {
    const prevAllowed = process.env.ALLOWED_ORIGINS;

    afterEach(() => {
      vi.resetModules();
      if (prevAllowed === undefined) {
        delete process.env.ALLOWED_ORIGINS;
      } else {
        process.env.ALLOWED_ORIGINS = prevAllowed;
      }
    });

    it("allows credentialed CORS for origins listed in ALLOWED_ORIGINS", async () => {
      process.env.ALLOWED_ORIGINS =
        "https://partner.example.com, https://other.example";
      vi.resetModules();
      const { OPTIONS: optionsHandler } = await import("./route");
      const origin = "https://partner.example.com";
      const res = await optionsHandler(
        new NextRequest("http://localhost/api/links", {
          method: "OPTIONS",
          headers: { origin },
        }),
      );
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });
  });
});

describe("POST /api/links origin echo", () => {
  it("passes a valid x-purl-origin header to the broadcast", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.link.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);
    vi.mocked(broadcastLinksChanged).mockClear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><head></head></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const req = new NextRequest("http://localhost/api/links", {
      method: "POST",
      headers: { "content-type": "application/json", "x-purl-origin": "tab-1" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    await POST(req);

    expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith(
      "user-123",
      "tab-1",
    );
  });
});

describe("GET /api/links", () => {
  function getRequest(
    query = "",
    init?: { cookie?: string; headers?: Record<string, string> },
  ): NextRequest {
    const headers = new Headers(init?.headers);
    if (init?.cookie) headers.set("cookie", init.cookie);
    return new NextRequest(`http://localhost/api/links${query}`, { headers });
  }

  beforeEach(() => {
    vi.mocked(prisma.link.findMany).mockReset();
    vi.mocked(prisma.link.count).mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });

  it("returns grouped links, next cursor, and total", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      MOCK_LINK,
      { ...MOCK_LINK, id: "link-2" },
    ] as never);
    vi.mocked(prisma.link.count).mockResolvedValue(42 as never);

    const res = await GET(getRequest("?limit=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123" },
        take: 2,
      }),
    );
    expect(body.total).toBe(42);
    expect(body.nextCursor).toBe(`${CREATED_AT.toISOString()}_${MOCK_LINK.id}`);
    const ids = body.groups.flatMap(
      (g: { links: { id: string }[] }) => g.links.map((l) => l.id),
    );
    expect(ids).toEqual([MOCK_LINK.id]);
  });

  it("clamps limit to the save cap and applies the cursor", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.link.count).mockResolvedValue(0 as never);

    await GET(getRequest(`?limit=99999&cursor=${CREATED_AT.toISOString()}`));

    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123", createdAt: { lt: CREATED_AT } },
        take: 1001,
      }),
    );
  });

  it("groups by the tz cookie's zone and reports it in the response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T00:00:00Z"));
    try {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      // 23:30 UTC on the 25th is already 08:30 on the 26th in Tokyo (UTC+9),
      // so the label differs between the two zones.
      const link = { ...MOCK_LINK, createdAt: new Date("2026-09-25T23:30:00Z") };
      vi.mocked(prisma.link.findMany).mockResolvedValue([link] as never);
      vi.mocked(prisma.link.count).mockResolvedValue(1 as never);

      const res = await GET(getRequest("", { cookie: "tz=Asia%2FTokyo" }));
      const body = await res.json();

      expect(body.timeZone).toBe("Asia/Tokyo");
      expect(body.groups).toEqual([
        { label: "Today", links: [expect.objectContaining({ id: link.id })] },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the x-vercel-ip-timezone header when there is no cookie", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.link.count).mockResolvedValue(0 as never);

    const res = await GET(
      getRequest("", { headers: { "x-vercel-ip-timezone": "America/Sao_Paulo" } }),
    );
    const body = await res.json();

    expect(body.timeZone).toBe("America/Sao_Paulo");
  });
});
