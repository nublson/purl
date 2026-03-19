import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

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
    },
  },
}));

vi.mock("open-graph-scraper", () => ({
  default: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const ogs = (await import("open-graph-scraper")).default;

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
  createdAt: CREATED_AT,
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/links", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function mockOgsSuccess(overrides: {
  ogTitle?: string;
  ogDescription?: string | null;
  ogImage?: Array<{ url: string }> | null;
  favicon?: string | null;
} = {}) {
  vi.mocked(ogs).mockResolvedValue({
    error: false,
    result: {
      ogTitle: "Example Domain",
      ogDescription: null,
      ogImage: null,
      favicon: null,
      ...overrides,
    },
    html: "",
    response: {} as Response,
  });
}

function mockOgsFailure() {
  vi.mocked(ogs).mockResolvedValue({
    error: true,
    result: undefined,
    html: "",
    response: {} as Response,
  });
}

describe("POST /api/links", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.create).mockReset();
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

    it("returns 400 when url has no protocol", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const res = await POST(postRequest({ url: "example.com" }));
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
        })
      );
    });
  });

  describe("successful link creation", () => {
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
        })
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
        })
      );
    });

    it("serialises createdAt as ISO string in the response", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      const res = await POST(postRequest({ url: "https://example.com" }));
      const json = await res.json();

      expect(json.createdAt).toBe(CREATED_AT.toISOString());
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
        })
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
        })
      );
    });

    it("falls back to domain when ogs result is null", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(ogs).mockResolvedValue({
        error: false,
        result: null,
        html: "",
        response: {} as Response,
      });
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "example.com",
      } as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "example.com" }),
        })
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
        })
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
        })
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
        })
      );
    });

    it("passes fetchOptions with User-Agent when calling ogs", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(ogs).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com",
          fetchOptions: expect.objectContaining({
            headers: expect.objectContaining({
              "User-Agent":
                "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
            }),
          }),
        })
      );
    });
  });
});
