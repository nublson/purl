import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    },
  },
}));

const mockReadLink = vi.fn();
const mockUpdateLink = vi.fn();
const mockDeleteLink = vi.fn();
const mockMoveLinkToFolder = vi.fn();
const mockUpdateLinkForUser = vi.fn();
const mockAssertFolderOwned = vi.fn();

class MockFolderNotFoundError extends Error {
  constructor() { super("Folder not found."); }
}
vi.mock("@/lib/folders", () => ({
  assertFolderOwned: mockAssertFolderOwned,
  FolderNotFoundError: MockFolderNotFoundError,
}));

class MockUnauthorizedError extends Error {
  constructor() { super("Unauthorized"); }
}

vi.mock("@/lib/links", () => ({
  readLink: mockReadLink,
  updateLink: mockUpdateLink,
  deleteLink: mockDeleteLink,
  moveLinkToFolder: mockMoveLinkToFolder,
  updateLinkForUser: mockUpdateLinkForUser,
  UnauthorizedError: MockUnauthorizedError,
}));

const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com",
  title: "Example",
  description: null,
  favicon: "https://example.com/favicon.ico",
  thumbnail: null,
  domain: "example.com",
  contentType: "WEB",
  createdAt: new Date("2025-01-01T12:00:00.000Z"),
  userId: "user-1",
};

const params = Promise.resolve({ id: "link-1" });

describe("GET /api/v1/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockReadLink.mockRejectedValue(new MockUnauthorizedError());
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links/link-1"),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockReadLink.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links/link-1"),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns link with CORS header", async () => {
    mockReadLink.mockResolvedValue(MOCK_LINK);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links/link-1"),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("link-1");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("PATCH /api/v1/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockUpdateLink.mockRejectedValue(new MockUnauthorizedError());
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockUpdateLink.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns updated link with CORS header", async () => {
    mockUpdateLink.mockResolvedValue({ ...MOCK_LINK, title: "New Title" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("New Title");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 400 when no updatable fields provided", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: "not-json",
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid URL", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ url: "not-a-url" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/links/:id folderId", () => {
  beforeEach(() => vi.clearAllMocks());

  function patch(body: unknown) {
    return new NextRequest("http://localhost/api/v1/links/link-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  it("moves the link into an owned folder", async () => {
    mockMoveLinkToFolder.mockResolvedValue({ ...MOCK_LINK, folderId: "f1" });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ folderId: "f1" }), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockAssertFolderOwned).toHaveBeenCalledWith("user-1", "f1");
    expect(mockMoveLinkToFolder).toHaveBeenCalledWith("user-1", "link-1", "f1");
    expect(mockUpdateLink).not.toHaveBeenCalled();
  });

  it("takes the link out of its folder with folderId: null", async () => {
    mockMoveLinkToFolder.mockResolvedValue({ ...MOCK_LINK, folderId: null });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ folderId: null }), { params });
    expect(res.status).toBe(200);
    expect(mockAssertFolderOwned).not.toHaveBeenCalled();
    expect(mockMoveLinkToFolder).toHaveBeenCalledWith("user-1", "link-1", null);
  });

  it("combines field edits and a move in one write", async () => {
    mockUpdateLinkForUser.mockResolvedValue({ ...MOCK_LINK, title: "New", folderId: "f1" });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ title: "New", folderId: "f1" }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdateLinkForUser).toHaveBeenCalledWith("user-1", "link-1", {
      title: "New",
      folderId: "f1",
    });
    expect(mockMoveLinkToFolder).not.toHaveBeenCalled();
  });

  it("returns 404 for a folder the user doesn't own", async () => {
    mockAssertFolderOwned.mockRejectedValue(new MockFolderNotFoundError());
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ folderId: "foreign" }), { params });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Folder not found" });
    expect(mockMoveLinkToFolder).not.toHaveBeenCalled();
  });

  it("returns 404 when the link isn't the user's", async () => {
    mockAssertFolderOwned.mockResolvedValue(undefined);
    mockMoveLinkToFolder.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ folderId: "f1" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-string folderId", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ folderId: 42 }), { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid folder" });
  });
});

describe("DELETE /api/v1/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockDeleteLink.mockRejectedValue(new MockUnauthorizedError());
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockDeleteLink.mockResolvedValue(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 with CORS header on success", async () => {
    mockDeleteLink.mockResolvedValue(true);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("OPTIONS /api/v1/links/:id", () => {
  it("returns 204 with CORS headers", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "OPTIONS" })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
