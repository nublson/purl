import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
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

const mockBroadcastLinksChanged = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcastLinksChanged,
}));

const { GET, POST } = await import("./route");
const {
  FolderNameError,
  FolderLimitError,
  FolderEmojiError,
  FolderDescriptionError,
} = await import(
  "@/lib/folders",
);

function getRequest() {
  return new NextRequest("http://localhost/api/folders", { method: "GET" });
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/folders", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /api/folders", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockListFoldersForUser.mockReset();
    mockCreateFolder.mockReset();
    mockBroadcastLinksChanged.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockListFoldersForUser).not.toHaveBeenCalled();
  });

  it("returns 200 with the folder list on success", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const folders = [
      { id: "f1", name: "Reading", slug: "reading", emoji: "🦪", linkCount: 3 },
    ];
    mockListFoldersForUser.mockResolvedValue(folders);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(folders);
    expect(mockListFoldersForUser).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/folders", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockListFoldersForUser.mockReset();
    mockCreateFolder.mockReset();
    mockBroadcastLinksChanged.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON body for a non-JSON body", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 NAME_EMPTY for a non-string name", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("empty", "Give your folder a name."),
    );
    const res = await POST(postRequest({ name: 123 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Give your folder a name.",
      code: "NAME_EMPTY",
    });
    expect(mockCreateFolder).toHaveBeenCalledWith("user-1", "", undefined, undefined);
  });

  it("returns 400 NAME_EMPTY for an empty name", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("empty", "Give your folder a name."),
    );
    const res = await POST(postRequest({ name: "   " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Give your folder a name.",
      code: "NAME_EMPTY",
    });
  });

  it("returns 400 NAME_TOO_LONG for an over-long name", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("too_long", "Keep the name to 60 characters or fewer."),
    );
    const res = await POST(postRequest({ name: "a".repeat(70) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Keep the name to 60 characters or fewer.",
      code: "NAME_TOO_LONG",
    });
  });

  it("returns 409 NAME_TAKEN when the name collides", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockRejectedValue(
      new FolderNameError("taken", "You already have a folder with that name. Choose another."),
    );
    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "You already have a folder with that name. Choose another.",
      code: "NAME_TAKEN",
    });
  });

  it("returns 403 LIMIT_REACHED/FOLDER_LIMIT at the folder cap", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
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

  it("returns 201 with the created folder and broadcasts the change", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const created = { id: "f1", name: "Reading", slug: "reading", emoji: "🦪", linkCount: 0 };
    mockCreateFolder.mockResolvedValue(created);

    const res = await POST(postRequest({ name: "Reading" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreateFolder).toHaveBeenCalledWith("user-1", "Reading", undefined, undefined);
    expect(mockBroadcastLinksChanged).toHaveBeenCalledWith("user-1", null);
  });

  it("passes the emoji through to createFolder", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const created = { id: "f1", name: "Code", slug: "code", emoji: "👩‍💻", linkCount: 0 };
    mockCreateFolder.mockResolvedValue(created);

    const res = await POST(postRequest({ name: "Code", emoji: "👩‍💻" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreateFolder).toHaveBeenCalledWith("user-1", "Code", "👩‍💻", undefined);
  });

  it("passes the description through to createFolder", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockResolvedValue({
      id: "f1",
      name: "Oyster",
      slug: "oyster",
      emoji: "🦪",
      description: "Pearls.",
      linkCount: 0,
    });

    const res = await POST(postRequest({ name: "Oyster", description: "Pearls." }));
    expect(res.status).toBe(201);
    expect(mockCreateFolder).toHaveBeenCalledWith(
      "user-1",
      "Oyster",
      undefined,
      "Pearls.",
    );
  });

  it("returns 400 INVALID_DESCRIPTION for a non-string description without calling the lib", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await POST(postRequest({ name: "Oyster", description: 42 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The description must be text.",
      code: "INVALID_DESCRIPTION",
    });
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_DESCRIPTION when the lib rejects the description", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockRejectedValue(new FolderDescriptionError());
    const res = await POST(postRequest({ name: "Oyster", description: "a".repeat(161) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Keep the description to 160 characters or fewer.",
      code: "INVALID_DESCRIPTION",
    });
  });

  it("returns 400 INVALID_EMOJI for a non-string emoji without calling the lib", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await POST(postRequest({ name: "Code", emoji: 42 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Pick a single emoji.",
      code: "INVALID_EMOJI",
    });
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EMOJI when the lib rejects the emoji", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockCreateFolder.mockRejectedValue(new FolderEmojiError());
    const res = await POST(postRequest({ name: "Code", emoji: "ab" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Pick a single emoji.",
      code: "INVALID_EMOJI",
    });
    expect(mockBroadcastLinksChanged).not.toHaveBeenCalled();
  });
});
