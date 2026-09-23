import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const client = {
    link: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation(
    (fn: (tx: typeof client) => unknown) => fn(client),
  );
  return { default: client };
});

vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { getAdminSupabase } = await import("@/lib/supabase-admin");
const {
  createLinkFromFile,
  createSignedFileUrlForLink,
  InvalidUploadTypeError,
  UploadStorageError,
} = await import("./upload-file");

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
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(prisma.$transaction).mockClear();
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
    vi.mocked(prisma.link.update).mockImplementation(
      (async ({ data }: { data: { url: string } }) => ({
        id: "link-1",
        url: data.url,
      })) as never,
    );
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
        }),
      }),
    );
  });

  it("stores the stable authenticated file route instead of an expiring signed URL", async () => {
    setupSupabaseSuccess("https://files.example.com/u/doc.pdf");
    const file = new File([new Uint8Array(2048)], "doc.pdf", {
      type: "application/pdf",
    });

    const link = await createLinkFromFile(file, "user-1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.link.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { url: "/api/links/link-1/file" },
    });
    expect(link.url).toBe("/api/links/link-1/file");
    expect(createSignedUrlMock).not.toHaveBeenCalled();
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

describe("createSignedFileUrlForLink", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.findFirst).mockReset();
    vi.mocked(getAdminSupabase).mockReset();
    createSignedUrlMock.mockReset();
    fromMock.mockReset();
  });

  it("returns null without signing when the link is missing or not owned", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue(null);

    await expect(createSignedFileUrlForLink("user-1", "link-1")).resolves.toBeNull();

    expect(prisma.link.findFirst).toHaveBeenCalledWith({
      where: { id: "link-1", userId: "user-1" },
      select: { storagePath: true },
    });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("returns null for links that are not uploads", async () => {
    vi.mocked(prisma.link.findFirst).mockResolvedValue({
      storagePath: null,
    } as never);

    await expect(createSignedFileUrlForLink("user-1", "link-1")).resolves.toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("signs the stored object path with a short lifetime", async () => {
    setupSupabaseSuccess("https://files.example.com/signed");
    vi.mocked(prisma.link.findFirst).mockResolvedValue({
      storagePath: "user-1/uuid.pdf",
    } as never);

    await expect(createSignedFileUrlForLink("user-1", "link-1")).resolves.toBe(
      "https://files.example.com/signed",
    );
    expect(fromMock).toHaveBeenCalledWith("user-uploads");
    expect(createSignedUrlMock).toHaveBeenCalledWith("user-1/uuid.pdf", 300);
  });

  it("throws UploadStorageError when signing fails", async () => {
    setupSupabaseSuccess();
    createSignedUrlMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    vi.mocked(prisma.link.findFirst).mockResolvedValue({
      storagePath: "user-1/uuid.pdf",
    } as never);

    await expect(
      createSignedFileUrlForLink("user-1", "link-1"),
    ).rejects.toBeInstanceOf(UploadStorageError);
  });
});
