import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the link layer so this test focuses on route logic:
// validation, status codes, and payload shaping.
vi.mock("@/lib/links", () => {
  class UnauthorizedError extends Error {
    readonly name = "UnauthorizedError";
  }

  return {
    readLink: vi.fn(),
    updateLink: vi.fn(),
    updateLinkForUser: vi.fn(),
    deleteLink: vi.fn(),
    moveLinkToFolder: vi.fn(),
    UnauthorizedError,
  };
});

vi.mock("@/lib/folders", () => {
  class FolderNotFoundError extends Error {
    readonly name = "FolderNotFoundError";
  }

  return { FolderNotFoundError, assertFolderOwned: vi.fn() };
});

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const links = await import("@/lib/links");
const {
  readLink,
  updateLink,
  updateLinkForUser,
  deleteLink,
  moveLinkToFolder,
  UnauthorizedError,
} = links;

const { FolderNotFoundError, assertFolderOwned } = await import("@/lib/folders");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const { auth } = await import("@/lib/auth");

const { GET, PATCH, DELETE: DELETE_HANDLER } = await import("./route");

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function createRequest(pathname: string, init?: NextRequestInit): NextRequest {
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
    vi.mocked(updateLinkForUser).mockReset();
    vi.mocked(deleteLink).mockReset();
    vi.mocked(moveLinkToFolder).mockReset();
    vi.mocked(assertFolderOwned).mockReset().mockResolvedValue(undefined);
    vi.mocked(broadcastLinksChanged).mockClear();
    vi.mocked(auth.api.getSession).mockReset();
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
        contentType: "WEB",
        createdAt,
        folderId: null,
        readAt: null,
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
        contentType: "WEB",
        createdAt: createdAt.toISOString(),
        folderId: null,
        readAt: null,
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
      const res = await PATCH(patchRequest({}), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "At least one of url, title, description, folderId, or read is required",
      });
    });

    it("returns 400 when read isn't a boolean", async () => {
      const res = await PATCH(patchRequest({ read: "yes" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "read must be true or false" });
      expect(updateLink).not.toHaveBeenCalled();
    });

    it("passes read to updateLink and returns readAt", async () => {
      const readAt = new Date("2025-06-21T09:00:00Z");
      vi.mocked(updateLink).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        contentType: "WEB",
        createdAt: new Date("2025-06-20T12:00:00Z"),
        userId: "user-123",
        folderId: null,
        readAt,
      });

      const res = await PATCH(patchRequest({ read: true }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(200);
      expect(updateLink).toHaveBeenCalledWith(ID, { read: true });
      expect(await res.json()).toMatchObject({ readAt: readAt.toISOString() });
    });

    it("returns 400 when url is invalid", async () => {
      const res = await PATCH(patchRequest({ url: "javascript:alert(1)" }), {
        params: Promise.resolve({ id: ID }),
      });

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
        contentType: "WEB",
        createdAt,
        userId: "user-123",
        folderId: null,
        readAt: null,
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
      expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith("user-123", null);
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
        contentType: "WEB",
        createdAt: new Date("2025-06-15T10:00:00Z"),
        userId: "user-123",
        folderId: null,
        readAt: null,
      });

      await PATCH(patchRequest({ description: null }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(vi.mocked(updateLink)).toHaveBeenCalledWith(ID, {
        description: null,
      });
    });

    it("returns 404 when updateLink returns null (not found/not owned)", async () => {
      vi.mocked(updateLink).mockResolvedValue(null);

      const res = await PATCH(patchRequest({ title: "New title" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
      expect(vi.mocked(broadcastLinksChanged)).not.toHaveBeenCalled();
    });

    it("returns 401 when the link layer throws UnauthorizedError", async () => {
      vi.mocked(updateLink).mockRejectedValue(new UnauthorizedError());

      const res = await PATCH(patchRequest({ title: "New title" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 400 when folderId is not a string or null", async () => {
      const res = await PATCH(patchRequest({ folderId: 123 }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid folder" });
      expect(vi.mocked(moveLinkToFolder)).not.toHaveBeenCalled();
    });

    it("does not trip the 'nothing to update' guard when only folderId is given", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
        session: {},
      } as never);
      vi.mocked(moveLinkToFolder).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        contentType: "WEB",
        createdAt: new Date("2025-06-15T10:00:00Z"),
        folderId: "folder-1",
        readAt: null,
      } as never);

      const res = await PATCH(patchRequest({ folderId: "folder-1" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(200);
      expect(vi.mocked(updateLink)).not.toHaveBeenCalled();
    });

    it("moves the link to a folder", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
        session: {},
      } as never);
      vi.mocked(moveLinkToFolder).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        contentType: "WEB",
        createdAt: new Date("2025-06-15T10:00:00Z"),
        folderId: "folder-1",
        readAt: null,
      } as never);

      const res = await PATCH(patchRequest({ folderId: "folder-1" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(200);
      expect(vi.mocked(moveLinkToFolder)).toHaveBeenCalledWith(
        "user-123",
        ID,
        "folder-1",
      );
      const json = await res.json();
      expect(json.folderId).toBe("folder-1");
      expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith(
        "user-123",
        null,
      );
    });

    it("unfiles the link when folderId is null", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
        session: {},
      } as never);
      vi.mocked(moveLinkToFolder).mockResolvedValue({
        id: ID,
        url: "https://example.com",
        title: "Example Domain",
        description: null,
        favicon: "https://example.com/favicon.ico",
        thumbnail: null,
        domain: "example.com",
        contentType: "WEB",
        createdAt: new Date("2025-06-15T10:00:00Z"),
        folderId: null,
        readAt: null,
      } as never);

      const res = await PATCH(patchRequest({ folderId: null }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(200);
      expect(vi.mocked(moveLinkToFolder)).toHaveBeenCalledWith(
        "user-123",
        ID,
        null,
      );
      const json = await res.json();
      expect(json.folderId).toBeNull();
    });

    it("returns 404 when moveLinkToFolder returns null (not found/not owned)", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
        session: {},
      } as never);
      vi.mocked(moveLinkToFolder).mockResolvedValue(null);

      const res = await PATCH(patchRequest({ folderId: "folder-1" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
      expect(vi.mocked(broadcastLinksChanged)).not.toHaveBeenCalled();
    });

    it("returns 404 when moveLinkToFolder throws FolderNotFoundError (foreign folder)", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
        session: {},
      } as never);
      vi.mocked(moveLinkToFolder).mockRejectedValue(new FolderNotFoundError());

      const res = await PATCH(patchRequest({ folderId: "someone-elses" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Folder not found" });
    });

    it("returns 401 when there is no session for a folderId move", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const res = await PATCH(patchRequest({ folderId: "folder-1" }), {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(401);
      expect(vi.mocked(moveLinkToFolder)).not.toHaveBeenCalled();
    });

    describe("combined folderId + other fields", () => {
      it("returns 404 and does not call updateLink when folderId is a foreign folder", async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue({
          user: { id: "user-123" },
          session: {},
        } as never);
        vi.mocked(assertFolderOwned).mockRejectedValue(new FolderNotFoundError());

        const res = await PATCH(
          patchRequest({ title: "New title", folderId: "someone-elses" }),
          { params: Promise.resolve({ id: ID }) },
        );

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Folder not found" });
        expect(vi.mocked(updateLink)).not.toHaveBeenCalled();
        expect(vi.mocked(updateLinkForUser)).not.toHaveBeenCalled();
        expect(vi.mocked(moveLinkToFolder)).not.toHaveBeenCalled();
        expect(vi.mocked(broadcastLinksChanged)).not.toHaveBeenCalled();
      });

      it("applies the field update and the folder move in ONE write, broadcasting once", async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue({
          user: { id: "user-123" },
          session: {},
        } as never);
        vi.mocked(updateLinkForUser).mockResolvedValue({
          id: ID,
          url: "https://example.com",
          title: "New title",
          description: null,
          favicon: "https://example.com/favicon.ico",
          thumbnail: null,
          domain: "example.com",
          contentType: "WEB",
          createdAt: new Date("2025-06-15T10:00:00Z"),
          userId: "user-123",
          folderId: "folder-1",
          readAt: null,
        });

        const res = await PATCH(
          patchRequest({ title: "New title", folderId: "folder-1" }),
          { params: Promise.resolve({ id: ID }) },
        );

        expect(res.status).toBe(200);
        expect(vi.mocked(assertFolderOwned)).toHaveBeenCalledWith(
          "user-123",
          "folder-1",
        );
        expect(vi.mocked(updateLinkForUser)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(updateLinkForUser)).toHaveBeenCalledWith(
          "user-123",
          ID,
          { title: "New title", folderId: "folder-1" },
        );
        expect(vi.mocked(updateLink)).not.toHaveBeenCalled();
        expect(vi.mocked(moveLinkToFolder)).not.toHaveBeenCalled();
        const json = await res.json();
        expect(json.title).toBe("New title");
        expect(json.folderId).toBe("folder-1");
        expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith(
          "user-123",
          null,
        );
      });

      it("passes folderId null through to the single write when unfiling with an edit", async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue({
          user: { id: "user-123" },
          session: {},
        } as never);
        vi.mocked(updateLinkForUser).mockResolvedValue({
          id: ID,
          url: "https://example.com",
          title: "Example Domain",
          description: null,
          favicon: "https://example.com/favicon.ico",
          thumbnail: null,
          domain: "example.com",
          contentType: "WEB",
          createdAt: new Date("2025-06-15T10:00:00Z"),
          userId: "user-123",
          folderId: null,
          readAt: null,
        });

        const res = await PATCH(
          patchRequest({ description: null, folderId: null }),
          { params: Promise.resolve({ id: ID }) },
        );

        expect(res.status).toBe(200);
        expect(vi.mocked(assertFolderOwned)).not.toHaveBeenCalled();
        expect(vi.mocked(updateLinkForUser)).toHaveBeenCalledWith(
          "user-123",
          ID,
          { description: null, folderId: null },
        );
      });

      it("returns 404 and does not broadcast when the folder is deleted mid-request (write fails with P2003)", async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue({
          user: { id: "user-123" },
          session: {},
        } as never);
        // Ownership check passes, but the single write races against a folder
        // deleted in between; the lib maps that P2003 to FolderNotFoundError.
        vi.mocked(updateLinkForUser).mockRejectedValue(new FolderNotFoundError());

        const res = await PATCH(
          patchRequest({ title: "New title", folderId: "folder-1" }),
          { params: Promise.resolve({ id: ID }) },
        );

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Folder not found" });
        expect(vi.mocked(updateLinkForUser)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(updateLink)).not.toHaveBeenCalled();
        expect(vi.mocked(moveLinkToFolder)).not.toHaveBeenCalled();
        expect(vi.mocked(broadcastLinksChanged)).not.toHaveBeenCalled();
      });

      it("returns 404 without broadcasting when the link isn't owned", async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue({
          user: { id: "user-123" },
          session: {},
        } as never);
        vi.mocked(updateLinkForUser).mockResolvedValue(null);

        const res = await PATCH(
          patchRequest({ title: "New title", folderId: "folder-1" }),
          { params: Promise.resolve({ id: ID }) },
        );

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Not found" });
        expect(vi.mocked(broadcastLinksChanged)).not.toHaveBeenCalled();
      });
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
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
        session: {},
      } as never);

      const req = createRequest(`/api/links/${ID}`, { method: "DELETE" });
      const res = await DELETE_HANDLER(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(204);
      expect(vi.mocked(broadcastLinksChanged)).toHaveBeenCalledWith("user-123", null);
    });

    it("returns 204 without broadcasting when session has no user id", async () => {
      vi.mocked(deleteLink).mockResolvedValue(true);
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const req = createRequest(`/api/links/${ID}`, { method: "DELETE" });
      const res = await DELETE_HANDLER(req, {
        params: Promise.resolve({ id: ID }),
      });

      expect(res.status).toBe(204);
      expect(vi.mocked(broadcastLinksChanged)).not.toHaveBeenCalled();
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
