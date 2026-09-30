import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({
  getSessionUser: mockGetSessionUser,
}));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

const mockListFoldersForUser = vi.fn();
const mockCreateFolder = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>(
    "@/lib/folders",
  );
  return {
    ...actual,
    listFoldersForUser: mockListFoldersForUser,
    createFolder: mockCreateFolder,
  };
});

const { GET, POST, OPTIONS } = await import("./route");
const { FolderNameError, FolderLimitError } = await import("@/lib/folders");

function getRequest() {
  return new NextRequest("http://localhost/api/v1/folders", { method: "GET" });
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/folders", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /api/v1/folders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without a session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockListFoldersForUser).not.toHaveBeenCalled();
  });

  it("returns 200 with the folder list and CORS header", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    const folders = [{ id: "f1", name: "Reading", slug: "reading", linkCount: 3 }];
    mockListFoldersForUser.mockResolvedValue(folders);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(folders);
    expect(mockListFoldersForUser).toHaveBeenCalledWith("user-1");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("POST /api/v1/folders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without a session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON body for a non-JSON body", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 NAME_EMPTY for a non-string name", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("empty", "Give your folder a name."),
    );
    const res = await POST(postRequest({ name: 123 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Give your folder a name.",
      code: "NAME_EMPTY",
    });
  });

  it("returns 400 NAME_TOO_LONG for an over-long name", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("too_long", "Keep it under 60 characters."),
    );
    const res = await POST(postRequest({ name: "a".repeat(70) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Keep it under 60 characters.",
      code: "NAME_TOO_LONG",
    });
  });

  it("returns 409 NAME_TAKEN when the name collides", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("taken", "You already have a folder with that name."),
    );
    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "You already have a folder with that name.",
      code: "NAME_TAKEN",
    });
  });

  it("returns 403 LIMIT_REACHED/FOLDER_LIMIT at the folder cap", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockCreateFolder.mockRejectedValue(
      new FolderLimitError("You can have up to 100 folders."),
    );
    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You can have up to 100 folders.",
      code: "LIMIT_REACHED",
      feature: "FOLDER_LIMIT",
    });
  });

  it("returns 201 with the created folder and CORS header", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    const created = { id: "f1", name: "Reading", slug: "reading", linkCount: 0 };
    mockCreateFolder.mockResolvedValue(created);

    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreateFolder).toHaveBeenCalledWith("user-1", "Reading");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
  });

  it("does not broadcast when creation fails", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("taken", "You already have a folder with that name."),
    );
    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(409);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/v1/folders", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/v1/folders", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
