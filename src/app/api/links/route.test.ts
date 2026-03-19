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

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };
const CREATED_AT = new Date("2025-06-15T10:00:00Z");
const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com",
  title: "Example Domain",
  favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
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

describe("POST /api/links", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.create).mockReset();
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>Example</title>",
      });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><head><title>Example Domain</title></head></html>",
      });
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      const res = await POST(postRequest({ url: "https://example.com" }));

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        id: "link-1",
        url: "https://example.com",
        title: "Example Domain",
        favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
        domain: "example.com",
        createdAt: CREATED_AT.toISOString(),
      });
    });

    it("writes the authenticated user id to the database record", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>Example</title>",
      });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>Example</title>",
      });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>Example</title>",
      });
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      const res = await POST(postRequest({ url: "https://example.com" }));
      const json = await res.json();

      expect(json.createdAt).toBe(CREATED_AT.toISOString());
    });
  });

  describe("title scraping fallback", () => {
    it("falls back to domain as title when fetch throws a network error", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockFetch.mockRejectedValue(new Error("Network error"));
      vi.mocked(prisma.link.create).mockResolvedValue({
        ...MOCK_LINK,
        title: "example.com",
      } as never);

      const res = await POST(postRequest({ url: "https://example.com" }));

      expect(res.status).toBe(201);
      expect(vi.mocked(prisma.link.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "example.com" }),
        })
      );
    });

    it("falls back to domain as title when fetch response is not ok (404)", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
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

    it("falls back to domain as title when HTML has no <title> tag", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<html><body>No title here</body></html>",
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>   </title>",
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

    it("normalises internal whitespace in the scraped title", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>  My   Noisy\n  Title  </title>",
      });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => `<title>${longTitle}</title>`,
      });
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

    it("sends the correct User-Agent header when scraping the target URL", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<title>Example</title>",
      });
      vi.mocked(prisma.link.create).mockResolvedValue(MOCK_LINK as never);

      await POST(postRequest({ url: "https://example.com" }));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent":
              "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
          }),
        })
      );
    });
  });
});
