import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/uploads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/uploads")>()),
  createUploadForUser: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { headers } = await import("next/headers");
const { createUploadForUser, InvalidUploadError } = await import("@/lib/uploads");
const { StorageLimitError } = await import("@/lib/entitlements");
const { FolderNotFoundError } = await import("@/lib/folders");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");

const MOCK_SESSION = { user: { id: "user-123", username: "user-123" }, session: {} };
const CREATED_AT = new Date("2025-06-15T10:00:00Z");

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/uploads", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/uploads", () => {
  const UPLOAD = {
    url: "https://abc.public.blob.vercel-storage.com/users/user-123/c1/My-Shot-x1.png",
    previewUrl:
      "https://abc.public.blob.vercel-storage.com/users/user-123/c1/preview-x2.webp",
    name: "My Shot.png",
    mimeType: "image/png",
    width: 1600,
    height: 900,
    duration: null,
  };
  const UPLOADED_LINK = {
    id: "link-up",
    url: UPLOAD.url,
    title: "My Shot",
    favicon: "https://purl.live/icon.png",
    description: null,
    thumbnail: UPLOAD.previewUrl,
    domain: "purl.live",
    contentType: "IMAGE" as const,
    createdAt: CREATED_AT,
    folderId: null,
    mimeType: "image/png",
    width: 1600,
    height: 900,
    duration: null,
    frameable: null,
    embed: false,
    upload: true,
  };

  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    vi.mocked(auth.api.getSession).mockReset().mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createUploadForUser).mockReset().mockResolvedValue(UPLOADED_LINK);
    vi.mocked(broadcastLinksChanged).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 without a browser session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await POST(postRequest({ upload: UPLOAD }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createUploadForUser).not.toHaveBeenCalled();
  });

  it("returns 401 for an API key (an Authorization header), even with a session", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ authorization: "Bearer purl_key" }) as never,
    );
    const res = await POST(postRequest({ upload: UPLOAD }));
    expect(res.status).toBe(401);
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(createUploadForUser).not.toHaveBeenCalled();
  });

  it("returns 503 UPLOADS_UNAVAILABLE without a Blob store", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const res = await POST(postRequest({ upload: UPLOAD }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Uploads aren't available here",
      code: "UPLOADS_UNAVAILABLE",
    });
    expect(createUploadForUser).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "file",
    { ...UPLOAD, url: 1 },
    { ...UPLOAD, name: undefined },
    { ...UPLOAD, width: "1600" },
  ])("returns 400 INVALID_UPLOAD for upload %j", async (upload) => {
    const res = await POST(postRequest({ upload }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid upload",
      code: "INVALID_UPLOAD",
    });
    expect(createUploadForUser).not.toHaveBeenCalled();
  });

  it("returns 400 when folderId is not a string", async () => {
    const res = await POST(postRequest({ upload: UPLOAD, folderId: 7 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid folder" });
  });

  it("returns 201 with the new pearl and broadcasts the change", async () => {
    const req = new NextRequest("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json", "x-purl-origin": "tab-1" },
      body: JSON.stringify({ upload: UPLOAD, folderId: "folder-1" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ...UPLOADED_LINK,
      createdAt: CREATED_AT.toISOString(),
      moved: false,
    });
    expect(createUploadForUser).toHaveBeenCalledWith("user-123", UPLOAD, {
      folderId: "folder-1",
    });
    expect(broadcastLinksChanged).toHaveBeenCalledWith("user-123", "tab-1");
  });

  it("passes no folder when none is given", async () => {
    await POST(postRequest({ upload: UPLOAD }));
    expect(createUploadForUser).toHaveBeenCalledWith("user-123", UPLOAD, undefined);
  });

  it("returns 400 INVALID_UPLOAD with the error's message", async () => {
    vi.mocked(createUploadForUser).mockRejectedValue(
      new InvalidUploadError("Unsupported file type"),
    );
    const res = await POST(postRequest({ upload: UPLOAD }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Unsupported file type",
      code: "INVALID_UPLOAD",
    });
    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("returns 403 STORAGE_LIMIT when the storage is full", async () => {
    vi.mocked(createUploadForUser).mockRejectedValue(
      new StorageLimitError(
        "Your 250 MB of storage is full. Delete files you no longer need to upload more.",
      ),
    );
    const res = await POST(postRequest({ upload: UPLOAD }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Your 250 MB of storage is full. Delete files you no longer need to upload more.",
      code: "LIMIT_REACHED",
      feature: "STORAGE_LIMIT",
    });
  });

  it("returns 404 for a folder the user doesn't own", async () => {
    vi.mocked(createUploadForUser).mockRejectedValue(new FolderNotFoundError());
    const res = await POST(postRequest({ upload: UPLOAD, folderId: "nope" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Folder not found" });
  });

  it("returns 400 for a body that isn't JSON", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/uploads", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(createUploadForUser).not.toHaveBeenCalled();
  });
});
