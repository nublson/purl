import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockUpdateFolder = vi.fn();
const mockDeleteFolder = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>(
    "@/lib/folders",
  );
  return {
    ...actual,
    updateFolder: mockUpdateFolder,
    deleteFolder: mockDeleteFolder,
  };
});

const mockBroadcastLinksChanged = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcastLinksChanged,
}));

const { PATCH, DELETE } = await import("./route");
const {
  FolderNameError,
  FolderNotFoundError,
  FolderLimitError,
  FolderEmojiError,
} = await import("@/lib/folders");

function ctx(id = "f1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/folders/f1", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteRequest(query = "") {
  return new NextRequest(`http://localhost/api/folders/f1${query}`, {
    method: "DELETE",
  });
}

describe("PATCH /api/folders/[id]", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockUpdateFolder.mockReset();
    mockDeleteFolder.mockReset();
    mockBroadcastLinksChanged.mockReset();
  });

  it("shares or unshares the folder with isPublic", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockResolvedValue({ id: "f1", isPublic: true });
    const res = await PATCH(patchRequest({ isPublic: true }), {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdateFolder).toHaveBeenCalledWith(
      "user-1",
      "f1",
      expect.objectContaining({ isPublic: true }),
    );
  });

  it("returns 400 INVALID_PUBLIC for a non-boolean isPublic", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest({ isPublic: "yes" }), {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_PUBLIC");
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "Reading" }), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON body for a non-JSON body", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest("not json"), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 NAME_EMPTY for a non-string name", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockRejectedValue(
      new FolderNameError("empty", "Give your folder a name."),
    );
    const res = await PATCH(patchRequest({ name: null }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Give your folder a name.",
      code: "NAME_EMPTY",
    });
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: "",
      emoji: undefined,
    });
  });

  it("returns 400 NAME_TOO_LONG for an over-long name", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockRejectedValue(
      new FolderNameError("too_long", "Keep the name to 60 characters or fewer."),
    );
    const res = await PATCH(patchRequest({ name: "a".repeat(70) }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Keep the name to 60 characters or fewer.",
      code: "NAME_TOO_LONG",
    });
  });

  it("returns 409 NAME_TAKEN when the name collides", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockRejectedValue(
      new FolderNameError("taken", "You already have a folder with that name. Choose another."),
    );
    const res = await PATCH(patchRequest({ name: "Reading" }), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "You already have a folder with that name. Choose another.",
      code: "NAME_TAKEN",
    });
  });

  it("returns 403 LIMIT_REACHED/FOLDER_LIMIT when the lib throws it", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockRejectedValue(
      new FolderLimitError("You can have up to 100 folders."),
    );
    const res = await PATCH(patchRequest({ name: "Reading" }), ctx());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You can have up to 100 folders.",
      code: "LIMIT_REACHED",
      feature: "FOLDER_LIMIT",
    });
  });

  it("returns 404 Folder not found on FolderNotFoundError", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockRejectedValue(new FolderNotFoundError());
    const res = await PATCH(patchRequest({ name: "Reading" }), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Folder not found" });
  });

  it("returns 200 with the renamed folder and broadcasts the change", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const updated = { id: "f1", name: "Reading", slug: "reading", emoji: "🦪", linkCount: 2 };
    mockUpdateFolder.mockResolvedValue(updated);

    const res = await PATCH(patchRequest({ name: "Reading" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: "Reading",
      emoji: undefined,
    });
    expect(mockBroadcastLinksChanged).toHaveBeenCalledWith("user-1", null);
  });
  it("passes an emoji-only update through without a name", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const updated = { id: "f1", name: "Reading", slug: "reading", emoji: "📚", linkCount: 2 };
    mockUpdateFolder.mockResolvedValue(updated);

    const res = await PATCH(patchRequest({ emoji: "📚" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: undefined,
      emoji: "📚",
    });
  });

  it("passes emoji: null through to clear the emoji", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockResolvedValue({
      id: "f1",
      name: "Reading",
      slug: "reading",
      emoji: "🦪",
      linkCount: 2,
    });

    const res = await PATCH(patchRequest({ emoji: null }), ctx());
    expect(res.status).toBe(200);
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: undefined,
      emoji: null,
    });
  });

  it("passes the description through to updateFolder (null clears it)", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockResolvedValue({
      id: "f1",
      name: "Books",
      slug: "books",
      emoji: "🦪",
      description: null,
      linkCount: 0,
    });

    const res = await PATCH(patchRequest({ description: null }), ctx());
    expect(res.status).toBe(200);
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: undefined,
      emoji: undefined,
      description: null,
    });
  });

  it("returns 400 INVALID_DESCRIPTION for a non-string description without calling the lib", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest({ description: ["x"] }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The description must be text.",
      code: "INVALID_DESCRIPTION",
    });
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EMOJI for a non-string emoji without calling the lib", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest({ emoji: ["📚"] }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Pick a single emoji.",
      code: "INVALID_EMOJI",
    });
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EMOJI when the lib rejects the emoji", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockUpdateFolder.mockRejectedValue(new FolderEmojiError());
    const res = await PATCH(patchRequest({ emoji: "📚📚" }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Pick a single emoji.",
      code: "INVALID_EMOJI",
    });
    expect(mockBroadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("returns 400 Nothing to update for a body with neither field", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    // Real lib error class, thrown by the (mocked) lib for an empty update.
    const { FolderUpdateEmptyError } = await import("@/lib/folders");
    mockUpdateFolder.mockRejectedValue(new FolderUpdateEmptyError());
    const res = await PATCH(patchRequest({}), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nothing to update" });
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: undefined,
      emoji: undefined,
    });
  });
});

describe("DELETE /api/folders/[id]", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockUpdateFolder.mockReset();
    mockDeleteFolder.mockReset();
    mockBroadcastLinksChanged.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });

  it("returns 404 Folder not found on FolderNotFoundError", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockDeleteFolder.mockRejectedValue(new FolderNotFoundError());
    const res = await DELETE(deleteRequest(), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Folder not found" });
  });

  it("parses withLinks=true and passes withLinks: true", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 3 });

    const res = await DELETE(deleteRequest("?withLinks=true"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedLinks: 3 });
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: true,
    });
  });

  it("treats any non-'true' withLinks value as false", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 0 });

    const res = await DELETE(deleteRequest("?withLinks=1"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedLinks: 0 });
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: false,
    });
  });

  it("defaults withLinks to false when absent", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 0 });

    const res = await DELETE(deleteRequest(), ctx());
    expect(res.status).toBe(200);
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: false,
    });
  });

  it("returns 200 and broadcasts the change on success", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 5 });

    const res = await DELETE(deleteRequest("?withLinks=true"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedLinks: 5 });
    expect(mockBroadcastLinksChanged).toHaveBeenCalledWith("user-1", null);
  });
});
