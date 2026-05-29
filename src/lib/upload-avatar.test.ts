import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MAX_UPLOAD_BYTES } from "@/utils/upload-limits";

vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: vi.fn(),
}));

const { getAdminSupabase } = await import("@/lib/supabase-admin");
const {
  uploadUserAvatar,
  InvalidAvatarTypeError,
  AvatarMaxSizeError,
  AvatarStorageError,
} = await import("./upload-avatar");

const uploadMock = vi.fn();
const createBucketMock = vi.fn();
const fromMock = vi.fn();
const getBucketMock = vi.fn();
const updateBucketMock = vi.fn();

const SUPABASE_URL = "https://example.supabase.co";

function setupSupabaseSuccess() {
  getBucketMock.mockResolvedValue({ data: { public: true }, error: null });
  uploadMock.mockResolvedValue({ data: {}, error: null });
  createBucketMock.mockResolvedValue({ data: {}, error: null });
  fromMock.mockReturnValue({ upload: uploadMock });

  vi.mocked(getAdminSupabase).mockReturnValue({
    storage: {
      from: fromMock,
      getBucket: getBucketMock,
      createBucket: createBucketMock,
      updateBucket: updateBucketMock,
    },
  } as never);
}

describe("uploadUserAvatar", () => {
  beforeEach(() => {
    vi.mocked(getAdminSupabase).mockReset();
    uploadMock.mockReset();
    createBucketMock.mockReset();
    fromMock.mockReset();
    getBucketMock.mockReset();
    updateBucketMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a public URL and uploads with upsert for a valid image", async () => {
    setupSupabaseSuccess();
    const file = new File([new Uint8Array(10)], "photo.png", {
      type: "image/png",
    });

    const url = await uploadUserAvatar(file, "user-1");

    expect(url).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/avatars/user-1/avatar.png`,
    );
    expect(fromMock).toHaveBeenCalledWith("avatars");
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/avatar.png",
      expect.any(ArrayBuffer),
      { contentType: "image/png", upsert: true },
    );
  });

  it("maps image/jpeg to .jpg extension", async () => {
    setupSupabaseSuccess();
    const file = new File([new Uint8Array(10)], "photo.jpg", {
      type: "image/jpeg",
    });

    const url = await uploadUserAvatar(file, "user-1");

    expect(url).toContain("user-1/avatar.jpg");
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/avatar.jpg",
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
  });

  it("throws InvalidAvatarTypeError for non-image MIME types", async () => {
    setupSupabaseSuccess();
    const file = new File([new Uint8Array(10)], "doc.pdf", {
      type: "application/pdf",
    });

    await expect(uploadUserAvatar(file, "user-1")).rejects.toBeInstanceOf(
      InvalidAvatarTypeError,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws AvatarMaxSizeError when file exceeds limit", async () => {
    setupSupabaseSuccess();
    const file = new File(
      [new Uint8Array(AVATAR_MAX_UPLOAD_BYTES + 1)],
      "big.png",
      { type: "image/png" },
    );

    await expect(uploadUserAvatar(file, "user-1")).rejects.toBeInstanceOf(
      AvatarMaxSizeError,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws AvatarStorageError when admin supabase client is unavailable", async () => {
    vi.mocked(getAdminSupabase).mockReturnValue(null);
    const file = new File([new Uint8Array(10)], "photo.png", {
      type: "image/png",
    });

    await expect(uploadUserAvatar(file, "user-1")).rejects.toBeInstanceOf(
      AvatarStorageError,
    );
  });

  it("creates a public bucket when bucket is missing", async () => {
    getBucketMock.mockResolvedValue({
      data: null,
      error: { message: "Bucket not found" },
    });
    uploadMock.mockResolvedValue({ data: {}, error: null });
    createBucketMock.mockResolvedValue({ data: {}, error: null });
    fromMock.mockReturnValue({ upload: uploadMock });
    vi.mocked(getAdminSupabase).mockReturnValue({
      storage: {
        from: fromMock,
        getBucket: getBucketMock,
        createBucket: createBucketMock,
        updateBucket: updateBucketMock,
      },
    } as never);
    const file = new File([new Uint8Array(10)], "photo.png", {
      type: "image/png",
    });

    await uploadUserAvatar(file, "user-1");

    expect(createBucketMock).toHaveBeenCalledWith("avatars", { public: true });
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("throws AvatarStorageError when upload fails", async () => {
    setupSupabaseSuccess();
    uploadMock.mockResolvedValue({
      data: null,
      error: { message: "Upload rejected" },
    });
    const file = new File([new Uint8Array(10)], "photo.png", {
      type: "image/png",
    });

    await expect(uploadUserAvatar(file, "user-1")).rejects.toThrow(
      "Upload rejected",
    );
  });
});
