import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/upload-file", () => {
  class UploadStorageError extends Error {
    readonly name = "UploadStorageError";
  }
  return {
    createSignedFileUrlForLink: vi.fn(),
    UploadStorageError,
  };
});

const { auth } = await import("@/lib/auth");
const { createSignedFileUrlForLink, UploadStorageError } = await import(
  "@/lib/upload-file"
);
const { GET } = await import("./route");

const ID = "link-upload-1";
const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/user-uploads/user-123/file.pdf?token=abc";

function callGet(id = ID) {
  return GET(
    new NextRequest(`http://localhost/api/links/${id}/file`, { method: "GET" }),
    { params: Promise.resolve({ id }) },
  );
}

describe("GET /api/links/[id]/file", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(createSignedFileUrlForLink).mockReset();
  });

  it("returns 401 without a session and never signs a URL", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await callGet();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createSignedFileUrlForLink).not.toHaveBeenCalled();
  });

  it("returns 404 when the link is missing, not owned, or not an upload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-123" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockResolvedValue(null);

    const res = await callGet();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("scopes the lookup to the signed-in user and the requested link", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-123" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockResolvedValue(SIGNED_URL);

    await callGet("other-link");

    expect(createSignedFileUrlForLink).toHaveBeenCalledWith(
      "user-123",
      "other-link",
    );
  });

  it("redirects to a fresh signed URL without caching", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-123" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockResolvedValue(SIGNED_URL);

    const res = await callGet();

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED_URL);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 502 when storage cannot sign the file", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-123" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockRejectedValue(
      new UploadStorageError("bucket down"),
    );

    const res = await callGet();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to access file" });
  });
});
