import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { getAdminSupabase } = await import("@/lib/supabase-admin");
const { createLinkFromFile, InvalidUploadTypeError, UploadStorageError } =
  await import("./upload-file");

const uploadMock = vi.fn();
const createBucketMock = vi.fn();
const createSignedUrlMock = vi.fn();
const fromMock = vi.fn();
const getBucketMock = vi.fn();
const updateBucketMock = vi.fn();

function setupSupabaseSuccess(signedUrl = "https://files.example.com/file") {
  getBucketMock.mockResolvedValue({ data: { public: false }, error: null });
  uploadMock.mockResolvedValue({ data: {}, error: null });
  createSignedUrlMock.mockResolvedValue({
    data: { signedUrl },
    error: null,
  });
  createBucketMock.mockResolvedValue({ data: {}, error: null });
  fromMock.mockReturnValue({
    upload: uploadMock,
    createSignedUrl: createSignedUrlMock,
  });

  vi.mocked(getAdminSupabase).mockReturnValue({
    storage: {
      from: fromMock,
      getBucket: getBucketMock,
      createBucket: createBucketMock,
      updateBucket: updateBucketMock,
    },
  } as never);
}

describe("createLinkFromFile", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.create).mockReset();
    vi.mocked(getAdminSupabase).mockReset();
    uploadMock.mockReset();
    createBucketMock.mockReset();
    createSignedUrlMock.mockReset();
    fromMock.mockReset();
    getBucketMock.mockReset();
    updateBucketMock.mockReset();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("uuid-fixed");
    vi.mocked(prisma.link.create).mockResolvedValue({
      id: "link-1",
      createdAt: new Date("2026-03-31T10:00:00Z"),
    } as never);
  });

  it("creates a PDF link with formatted file-size description and .pdf domain", async () => {
    setupSupabaseSuccess("https://files.example.com/u/doc.pdf");
    const file = new File([new Uint8Array(2048)], "doc.pdf", {
      type: "application/pdf",
    });

    await createLinkFromFile(file, "user-1");

    expect(prisma.link.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentType: "PDF",
          domain: ".pdf",
          description: "PDF Document - 2 KB",
          storagePath: "user-1/uuid-fixed.pdf",
          url: "https://files.example.com/u/doc.pdf",
        }),
      }),
    );
  });

  it("creates an audio link with duration description and .wav domain", async () => {
    setupSupabaseSuccess("https://files.example.com/u/track.wav");
    const file = new File([new Uint8Array(10)], "track.wav", {
      type: "audio/wav",
    });

    await createLinkFromFile(file, "user-1", 200);

    expect(prisma.link.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentType: "AUDIO",
          domain: ".wav",
          description: "Audio File - 3:20",
        }),
      }),
    );
  });

  it("uses generic audio description when duration is missing", async () => {
    setupSupabaseSuccess("https://files.example.com/u/track.wav");
    const file = new File([new Uint8Array(10)], "track.wav", {
      type: "audio/wav",
    });

    await createLinkFromFile(file, "user-1");

    expect(prisma.link.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Audio File",
        }),
      }),
    );
  });

  it("falls back to MIME-based extension for extensionless filename", async () => {
    setupSupabaseSuccess("https://files.example.com/u/file.mp3");
    const file = new File([new Uint8Array(10)], "file", {
      type: "audio/mpeg",
    });

    await createLinkFromFile(file, "user-1");

    expect(prisma.link.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ domain: ".mp3" }),
      }),
    );
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/uuid-fixed.mp3",
      expect.any(ArrayBuffer),
      expect.any(Object),
    );
  });

  it("falls back to .bin when MIME subtype is missing", async () => {
    setupSupabaseSuccess("https://files.example.com/u/file.bin");
    const file = new File([new Uint8Array(10)], "file", {
      type: "audio/",
    });

    await createLinkFromFile(file, "user-1");

    expect(prisma.link.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ domain: ".bin" }),
      }),
    );
  });

  it("throws InvalidUploadTypeError for unsupported MIME types", async () => {
    setupSupabaseSuccess();
    const file = new File([new Uint8Array(10)], "image.png", {
      type: "image/png",
    });

    await expect(createLinkFromFile(file, "user-1")).rejects.toBeInstanceOf(
      InvalidUploadTypeError,
    );
  });

  it("throws UploadStorageError when admin supabase client is unavailable", async () => {
    vi.mocked(getAdminSupabase).mockReturnValue(null);
    const file = new File([new Uint8Array(10)], "doc.pdf", {
      type: "application/pdf",
    });

    await expect(createLinkFromFile(file, "user-1")).rejects.toBeInstanceOf(
      UploadStorageError,
    );
  });

  it("creates a private bucket before upload when bucket is missing", async () => {
    getBucketMock.mockResolvedValue({
      data: null,
      error: { message: "Bucket not found" },
    });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://files.example.com/u/doc.pdf" },
      error: null,
    });
    uploadMock.mockResolvedValue({ data: {}, error: null });
    createBucketMock.mockResolvedValue({ data: {}, error: null });
    fromMock.mockReturnValue({
      upload: uploadMock,
      createSignedUrl: createSignedUrlMock,
    });
    vi.mocked(getAdminSupabase).mockReturnValue({
      storage: {
        from: fromMock,
        getBucket: getBucketMock,
        createBucket: createBucketMock,
        updateBucket: updateBucketMock,
      },
    } as never);
    const file = new File([new Uint8Array(10)], "doc.pdf", {
      type: "application/pdf",
    });

    await createLinkFromFile(file, "user-1");

    expect(createBucketMock).toHaveBeenCalledWith("user-uploads", {
      public: false,
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });
});
