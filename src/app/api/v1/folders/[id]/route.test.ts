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

const { PATCH, DELETE, OPTIONS } = await import("./route");
const {
  FolderNameError,
  FolderNotFoundError,
  FolderUpdateEmptyError,
  FolderDescriptionError,
} = await import("@/lib/folders");

const ctx = () => ({ params: Promise.resolve({ id: "f1" }) });

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/folders/f1", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteRequest(query = "") {
  return new NextRequest(`http://localhost/api/v1/folders/f1${query}`, {
    method: "DELETE",
  });
}

const FOLDER = {
  id: "f1",
  name: "Reading",
  slug: "reading",
  emoji: "📚",
  description: null,
  linkCount: 2,
};

describe("PATCH /api/v1/folders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns 401 with CORS when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "x" }), ctx());
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await PATCH(patchRequest("not json"), ctx());
    expect(res.status).toBe(400);
  });

  it("updates the given fields, broadcasts, and returns the folder", async () => {
    mockUpdateFolder.mockResolvedValue(FOLDER);
    const res = await PATCH(
      patchRequest({ name: "Reading", emoji: "📚", description: null }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual(FOLDER);
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: "Reading",
      emoji: "📚",
      description: null,
    });
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
  });

  it("treats a non-string name as blank so it fails the name rules", async () => {
    mockUpdateFolder.mockRejectedValue(
      new FolderNameError("empty", "Give your folder a name."),
    );
    const res = await PATCH(patchRequest({ name: 5 }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Give your folder a name.",
      code: "NAME_EMPTY",
    });
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: "",
      emoji: undefined,
      description: undefined,
    });
  });

  it("returns 400 INVALID_EMOJI / INVALID_DESCRIPTION for non-string values without calling the lib", async () => {
    const emoji = await PATCH(patchRequest({ emoji: 1 }), ctx());
    expect(emoji.status).toBe(400);
    expect((await emoji.json()).code).toBe("INVALID_EMOJI");

    const description = await PATCH(patchRequest({ description: [] }), ctx());
    expect(description.status).toBe(400);
    expect((await description.json()).code).toBe("INVALID_DESCRIPTION");
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it("maps library errors: taken name 409, too-long description 400, empty update 400, unknown folder 404", async () => {
    mockUpdateFolder.mockRejectedValueOnce(
      new FolderNameError("taken", "You already have a folder with that name. Choose another."),
    );
    expect((await PATCH(patchRequest({ name: "Dup" }), ctx())).status).toBe(409);

    mockUpdateFolder.mockRejectedValueOnce(new FolderDescriptionError());
    expect(
      (await PATCH(patchRequest({ description: "x".repeat(200) }), ctx())).status,
    ).toBe(400);

    mockUpdateFolder.mockRejectedValueOnce(new FolderUpdateEmptyError());
    const empty = await PATCH(patchRequest({}), ctx());
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Nothing to update" });

    mockUpdateFolder.mockRejectedValueOnce(new FolderNotFoundError());
    const missing = await PATCH(patchRequest({ name: "x" }), ctx());
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/folders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns 401 when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx());
    expect(res.status).toBe(401);
    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });

  it("keeps the folder's links by default", async () => {
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 0 });
    const res = await DELETE(deleteRequest(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ deletedLinks: 0 });
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: false,
    });
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
  });

  it("deletes the links too with ?withLinks=true", async () => {
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 3 });
    const res = await DELETE(deleteRequest("?withLinks=true"), ctx());
    expect(await res.json()).toEqual({ deletedLinks: 3 });
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: true,
    });
  });

  it("returns 404 for an unknown or foreign folder", async () => {
    mockDeleteFolder.mockRejectedValue(new FolderNotFoundError());
    const res = await DELETE(deleteRequest(), ctx());
    expect(res.status).toBe(404);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/v1/folders/[id]", () => {
  it("answers the CORS preflight", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
