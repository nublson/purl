import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  avatarMaxSizeExceededMessage,
} from "@/utils/upload-limits";
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

vi.mock("@/lib/upload-avatar", () => {
  class InvalidAvatarTypeError extends Error {
    readonly name = "InvalidAvatarTypeError";
  }
  class AvatarMaxSizeError extends Error {
    readonly name = "AvatarMaxSizeError";
  }
  class AvatarStorageError extends Error {
    readonly name = "AvatarStorageError";
  }
  return {
    uploadUserAvatar: vi.fn(),
    InvalidAvatarTypeError,
    AvatarMaxSizeError,
    AvatarStorageError,
  };
});

const { auth } = await import("@/lib/auth");
const {
  uploadUserAvatar,
  InvalidAvatarTypeError,
  AvatarMaxSizeError,
  AvatarStorageError,
} = await import("@/lib/upload-avatar");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };
const MOCK_IMAGE_URL =
  "https://example.supabase.co/storage/v1/object/public/avatars/user-123/avatar.png";

function postRequest(file?: File): NextRequest {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new NextRequest("http://localhost/api/user/avatar", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/user/avatar", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(uploadUserAvatar).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await POST(
      postRequest(new File(["img"], "photo.png", { type: "image/png" })),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(uploadUserAvatar).not.toHaveBeenCalled();
  });

  it("returns 400 when file is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const res = await POST(postRequest());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing file upload." });
    expect(uploadUserAvatar).not.toHaveBeenCalled();
  });

  it("returns 413 when image exceeds size limit", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const oversized = new File(
      [new Uint8Array(AVATAR_MAX_UPLOAD_BYTES + 1)],
      "big.png",
      { type: "image/png" },
    );

    const res = await POST(postRequest(oversized));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: avatarMaxSizeExceededMessage(),
    });
    expect(uploadUserAvatar).not.toHaveBeenCalled();
  });

  it("returns 400 when upload helper throws InvalidAvatarTypeError", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(uploadUserAvatar).mockRejectedValue(
      new InvalidAvatarTypeError("Only image files are supported."),
    );

    const res = await POST(
      postRequest(new File(["abc"], "doc.pdf", { type: "application/pdf" })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Only image files are supported.",
    });
  });

  it("returns 413 when upload helper throws AvatarMaxSizeError", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(uploadUserAvatar).mockRejectedValue(
      new AvatarMaxSizeError(avatarMaxSizeExceededMessage()),
    );

    const res = await POST(
      postRequest(new File(["img"], "photo.png", { type: "image/png" })),
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: avatarMaxSizeExceededMessage(),
    });
  });

  it("returns 500 when upload helper throws AvatarStorageError", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(uploadUserAvatar).mockRejectedValue(
      new AvatarStorageError("Storage failed"),
    );

    const res = await POST(
      postRequest(new File(["img"], "photo.png", { type: "image/png" })),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Storage failed" });
  });

  it("returns 200 with image URL on success", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(uploadUserAvatar).mockResolvedValue(MOCK_IMAGE_URL);

    const file = new File(["img"], "photo.png", { type: "image/png" });
    const res = await POST(postRequest(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: MOCK_IMAGE_URL });

    // The request body round-trips through multipart form-data encoding, so the
    // File the route handler receives is reconstructed (not the same instance) and
    // gets a fresh `lastModified` timestamp — compare the fields that matter instead
    // of deep-equating the whole File object, which flakes when Date.now() ticks
    // between the two constructions.
    expect(uploadUserAvatar).toHaveBeenCalledTimes(1);
    const [receivedFile, receivedUserId] = vi.mocked(uploadUserAvatar).mock
      .calls[0] as [File, string];
    expect(receivedFile).toBeInstanceOf(File);
    expect(receivedFile.name).toBe(file.name);
    expect(receivedFile.type).toBe(file.type);
    expect(receivedFile.size).toBe(file.size);
    expect(await receivedFile.text()).toBe(await file.text());
    expect(receivedUserId).toBe("user-123");
  });
});
