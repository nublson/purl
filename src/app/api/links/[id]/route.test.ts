import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the link layer so this test focuses on route logic:
// validation, status codes, and payload shaping.
vi.mock("@/lib/links", () => {
  class UnauthorizedError extends Error {
    readonly name = "UnauthorizedError";
  }

  return {
    readLink: vi.fn(),
    updateLink: vi.fn(),
    deleteLink: vi.fn(),
    UnauthorizedError,
  };
});

const links = await import("@/lib/links");
const { readLink, updateLink, deleteLink, UnauthorizedError } = links as {
  readLink: ReturnType<typeof vi.fn>;
  updateLink: ReturnType<typeof vi.fn>;
  deleteLink: ReturnType<typeof vi.fn>;
  UnauthorizedError: typeof UnauthorizedError;
};

const { GET, PATCH, DELETE: DELETE_HANDLER } = await import("./route");

function createRequest(pathname: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, init);
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/links/123", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("links/[id] API route", () => {
  const ID = "link-1";

  beforeEach(() => {
    vi.mocked(readLink).mockReset();
    vi.mocked(updateLink).mockReset();
    vi.mocked(deleteLink).mockReset();
  });

  describe("GET", () => {
    it("returns 401 when the link layer throws UnauthorizedError", async () => {
      vi.mocked(readLink).mockRejectedValue(new UnauthorizedError());

      const req = createRequest(`/api/links/${ID}`, { method: "GET" });
      const res = await GET(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 404 when the link does not exist", async () => {
      vi.mocked(readLink).mockResolvedValue(null);

      const req = createRequest(`/api/links/${ID}`, { method: "GET" });
      const res = await GET(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    });

    it("returns a serialized link with createdAt ISO string", async () => {
      const createdAt = new Date("2025-06-15T10:00:00Z");
      vi.mocked(readLink).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        createdAt,
      });

      const req = createRequest(`/api/links/${ID}`, { method: "GET" });
      const res = await GET(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        createdAt: createdAt.toISOString(),
      });
    });
  });

  describe("PATCH", () => {
    it("returns 400 when the request body is invalid JSON", async () => {
      const req = new NextRequest("http://localhost/api/links/123", {
        method: "PATCH",
        body: "{{invalid json}}",
        headers: { "content-type": "application/json" },
      });

      const res = await PATCH(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    });

    it("returns 400 when no updatable fields are provided", async () => {
      const res = await PATCH(
        patchRequest({}),
        {
          params: Promise.resolve({ id: ID }),
        },
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "At least one of url, title, or description is required",
      });
    });

    it("returns 400 when url is invalid", async () => {
      const res = await PATCH(
        patchRequest({ url: "javascript:alert(1)" }),
        {
          params: Promise.resolve({ id: ID }),
        },
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid or missing URL" });
    });

    it("trims url and passes updated fields to updateLink", async () => {
      const createdAt = new Date("2025-06-20T12:00:00Z");
      vi.mocked(updateLink).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        createdAt,
      });

      const res = await PATCH(
        patchRequest({ url: "  https://example.com  " }),
        {
          params: Promise.resolve({ id: ID }),
        },
      );

      expect(res.status).toBe(200);
      expect(vi.mocked(updateLink)).toHaveBeenCalledWith(ID, {
        url: "https://example.com",
      });
    });

    it("passes description explicitly null when provided", async () => {
      vi.mocked(updateLink).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        createdAt: new Date("2025-06-15T10:00:00Z"),
      });

      await PATCH(
        patchRequest({ description: null }),
        {
          params: Promise.resolve({ id: ID }),
        },
      );

      expect(vi.mocked(updateLink)).toHaveBeenCalledWith(ID, {
        description: null,
      });
    });

    it("returns 404 when updateLink returns null (not found/not owned)", async () => {
      vi.mocked(updateLink).mockResolvedValue(null);

      const res = await PATCH(
        patchRequest({ title: "New title" }),
        {
          params: Promise.resolve({ id: ID }),
        },
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    });

    it("returns 401 when the link layer throws UnauthorizedError", async () => {
      vi.mocked(updateLink).mockRejectedValue(new UnauthorizedError());

      const res = await PATCH(
        patchRequest({ title: "New title" }),
        {
          params: Promise.resolve({ id: ID }),
        },
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  });

  describe("DELETE", () => {
    it("returns 404 when deleteLink returns false (not found/not owned)", async () => {
      vi.mocked(deleteLink).mockResolvedValue(false);

      const req = createRequest(`/api/links/${ID}`, { method: "DELETE" });
      const res = await DELETE_HANDLER(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    });

    it("returns 204 on success", async () => {
      vi.mocked(deleteLink).mockResolvedValue(true);

      const req = createRequest(`/api/links/${ID}`, { method: "DELETE" });
      const res = await DELETE_HANDLER(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(204);
    });

    it("returns 401 when the link layer throws UnauthorizedError", async () => {
      vi.mocked(deleteLink).mockRejectedValue(new UnauthorizedError());

      const req = createRequest(`/api/links/${ID}`, { method: "DELETE" });
      const res = await DELETE_HANDLER(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  });
});

