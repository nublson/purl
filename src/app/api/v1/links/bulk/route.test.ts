import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionUser: mockGetSessionUser }));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

const mockMoveLinksToFolder = vi.fn();
const mockDeleteLinksForUser = vi.fn();
vi.mock("@/lib/links", () => ({
  moveLinksToFolder: mockMoveLinksToFolder,
  deleteLinksForUser: mockDeleteLinksForUser,
}));

class MockFolderNotFoundError extends Error {}
vi.mock("@/lib/folders", () => ({ FolderNotFoundError: MockFolderNotFoundError }));

const route = await import("./route");

function request(method: "PATCH" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost/api/v1/links/bulk", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PATCH /api/v1/links/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("moves the links, broadcasts, and returns what moved", async () => {
    const result = { moved: [{ id: "l1", previousFolderId: null }], notFound: ["l2"] };
    mockMoveLinksToFolder.mockResolvedValue(result);
    const res = await route.PATCH(request("PATCH", { ids: ["l1", "l2"], folderId: "f1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(mockMoveLinksToFolder).toHaveBeenCalledWith("user-1", ["l1", "l2"], "f1");
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
  });

  it("does not broadcast when nothing moved", async () => {
    mockMoveLinksToFolder.mockResolvedValue({ moved: [], notFound: ["x"] });
    const res = await route.PATCH(request("PATCH", { ids: ["x"], folderId: null }));
    expect(res.status).toBe(200);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("returns 400 with a code for a bad body, before checking the session", async () => {
    const badJson = await route.PATCH(request("PATCH", "nope"));
    expect(badJson.status).toBe(400);
    const noFolder = await route.PATCH(request("PATCH", { ids: ["l1"] }));
    expect(noFolder.status).toBe(400);
    expect((await noFolder.json()).code).toBe("INVALID_FOLDER");
    const noIds = await route.PATCH(request("PATCH", { ids: [], folderId: "f1" }));
    expect((await noIds.json()).code).toBe("INVALID_IDS");
    expect(mockGetSessionUser).not.toHaveBeenCalled();
  });

  it("returns 401 without a session and 404 for an unknown folder", async () => {
    mockGetSessionUser.mockResolvedValueOnce(null);
    const unauthorized = await route.PATCH(request("PATCH", { ids: ["l1"], folderId: "f1" }));
    expect(unauthorized.status).toBe(401);

    mockMoveLinksToFolder.mockRejectedValueOnce(new MockFolderNotFoundError());
    const missing = await route.PATCH(request("PATCH", { ids: ["l1"], folderId: "nope" }));
    expect(missing.status).toBe(404);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/links/bulk – read state (removed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("no longer marks links read: a body with read and no folderId is a 400", async () => {
    const res = await route.PATCH(request("PATCH", { ids: ["l1"], read: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_FOLDER" });
    expect(mockMoveLinksToFolder).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/links/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("deletes the links, broadcasts, and returns the count", async () => {
    mockDeleteLinksForUser.mockResolvedValue(2);
    const res = await route.DELETE(request("DELETE", { ids: ["l1", "l2", "l1"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(mockDeleteLinksForUser).toHaveBeenCalledWith("user-1", ["l1", "l2"]);
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for bad ids and 401 without a session", async () => {
    const bad = await route.DELETE(request("DELETE", { ids: "l1" }));
    expect(bad.status).toBe(400);
    mockGetSessionUser.mockResolvedValueOnce(null);
    const unauthorized = await route.DELETE(request("DELETE", { ids: ["l1"] }));
    expect(unauthorized.status).toBe(401);
    expect(mockDeleteLinksForUser).not.toHaveBeenCalled();
  });
});

describe("CORS on /api/v1/links/bulk", () => {
  it("answers the preflight and adds CORS to responses", async () => {
    expect((await route.OPTIONS()).status).toBe(204);
    mockGetSessionUser.mockResolvedValue(null);
    const res = await route.DELETE(request("DELETE", { ids: ["l1"] }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
