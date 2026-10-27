import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  head: vi.fn(),
  del: vi.fn(),
  BlobNotFoundError: class BlobNotFoundError extends Error {},
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    link: {
      create: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      findFirst: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // insertWithinSaveLimit runs its callback against the same mocked client.
  client.$transaction.mockImplementation(
    async (cb: (tx: typeof client) => unknown) => cb(client),
  );
  return { default: client };
});

vi.mock("@/lib/folders", () => ({
  assertFolderOwned: vi.fn(),
  FolderNotFoundError: class FolderNotFoundError extends Error {
    readonly name = "FolderNotFoundError";
  },
}));

const { head, del, BlobNotFoundError } = await import("@vercel/blob");
const prisma = (await import("@/lib/prisma")).default;
const { assertFolderOwned, FolderNotFoundError } = await import("@/lib/folders");
const { StorageLimitError, SaveLimitError } = await import("@/lib/entitlements");
const { MAX_UPLOAD_BYTES_PER_ACCOUNT, MAX_UPLOAD_PREVIEW_BYTES } = await import(
  "@/lib/limits"
);
const { createUploadForUser, InvalidUploadError, parseUploadInput } =
  await import("./uploads");

const HOST = "https://abc123.public.blob.vercel-storage.com";
const FILE_PATH = "users/u1/c1/My-Shot-x1.png";
const PREVIEW_PATH = "users/u1/c1/preview-x2.webp";
const FILE_URL = `${HOST}/${FILE_PATH}`;
const PREVIEW_URL = `${HOST}/${PREVIEW_PATH}`;
const CREATED_AT = new Date("2026-10-27T10:00:00Z");

const INPUT = {
  url: FILE_URL,
  previewUrl: PREVIEW_URL,
  name: "My Shot.png",
  mimeType: "image/png",
  width: 1600,
  height: 900,
  duration: null,
};

type HeadResult = Awaited<ReturnType<typeof head>>;

function headResult(pathname: string, contentType: string, size: number): HeadResult {
  return {
    url: `${HOST}/${pathname}`,
    downloadUrl: `${HOST}/${pathname}?download=1`,
    pathname,
    contentType,
    contentDisposition: "inline",
    cacheControl: "public, max-age=31536000",
    size,
    uploadedAt: CREATED_AT,
    etag: "etag",
  } as HeadResult;
}

function mockHeads(
  fileType = "image/png",
  previewType = "image/webp",
  { fileSize = 123_456, previewSize = 4_000 } = {},
) {
  vi.mocked(head).mockImplementation(async (url) => {
    if (url === PREVIEW_URL) return headResult(PREVIEW_PATH, previewType, previewSize);
    if (url === FILE_URL) return headResult(FILE_PATH, fileType, fileSize);
    throw new Error(`unexpected head(${String(url)})`);
  });
}

function rowFrom(data: Record<string, unknown>) {
  return {
    id: "link-1",
    createdAt: CREATED_AT,
    readAt: null,
    needsMetadata: false,
    frameable: null,
    embed: false,
    folderId: null,
    ...data,
  };
}

describe("createUploadForUser", () => {
  beforeEach(() => {
    vi.stubEnv("BASE_URL", "https://purl.live");
    vi.mocked(head).mockReset();
    vi.mocked(del).mockReset().mockResolvedValue(undefined);
    vi.mocked(assertFolderOwned).mockReset().mockResolvedValue(undefined);
    vi.mocked(prisma.link.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.link.aggregate)
      .mockReset()
      .mockResolvedValue({ _sum: { fileSize: 0 } } as never);
    vi.mocked(prisma.link.findFirst).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.link.create)
      .mockReset()
      .mockImplementation((async ({ data }: { data: Record<string, unknown> }) =>
        rowFrom(data)) as never);
    vi.mocked(prisma.$executeRaw).mockReset().mockResolvedValue(0 as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates the row from the blob's head and the file's name", async () => {
    mockHeads();
    const link = await createUploadForUser("u1", INPUT);

    expect(prisma.link.create).toHaveBeenCalledTimes(1);
    const { data } = vi.mocked(prisma.link.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).toEqual({
      url: FILE_URL,
      title: "My Shot",
      favicon: "/icon.png",
      domain: "purl.live",
      contentType: "IMAGE",
      mimeType: "image/png",
      thumbnail: PREVIEW_URL,
      fileKey: FILE_PATH,
      fileSize: 123_456,
      width: 1600,
      height: 900,
      duration: null,
      description: null,
      userId: "u1",
    });
    expect(link).toMatchObject({
      id: "link-1",
      url: FILE_URL,
      title: "My Shot",
      contentType: "IMAGE",
      thumbnail: PREVIEW_URL,
      upload: true,
      folderId: null,
    });
    expect(link).not.toHaveProperty("fileKey");
    expect(del).not.toHaveBeenCalled();
  });

  it("counts the file's size from Blob against the storage cap, not the client's", async () => {
    mockHeads();
    vi.mocked(prisma.link.aggregate).mockResolvedValue({
      _sum: { fileSize: MAX_UPLOAD_BYTES_PER_ACCOUNT - 123_455 },
    } as never);

    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      StorageLimitError,
    );
  });

  it("returns the same pearl when one blob is saved again (a retry)", async () => {
    mockHeads();
    const first = await createUploadForUser("u1", INPUT);
    const row = await vi.mocked(prisma.link.create).mock.results[0].value;
    vi.mocked(prisma.link.findFirst).mockResolvedValue(row as never);

    const again = await createUploadForUser("u1", { ...INPUT, previewUrl: null });

    expect(prisma.link.create).toHaveBeenCalledTimes(1);
    expect(prisma.link.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", fileKey: FILE_PATH },
    });
    expect(again).toEqual(first);
    expect(del).not.toHaveBeenCalled();
  });

  it("returns the saved pearl on a retry at the save cap, deleting nothing", async () => {
    mockHeads();
    vi.mocked(prisma.link.count).mockResolvedValue(1_000);
    vi.mocked(prisma.link.findFirst).mockResolvedValue(
      rowFrom({
        url: FILE_URL,
        title: "My Shot",
        favicon: "/icon.png",
        domain: "purl.live",
        contentType: "IMAGE",
        mimeType: "image/png",
        thumbnail: PREVIEW_URL,
        fileKey: FILE_PATH,
        fileSize: 123_456,
        width: 1600,
        height: 900,
        duration: null,
        description: null,
        userId: "u1",
      }) as never,
    );

    const link = await createUploadForUser("u1", INPUT);

    expect(link).toMatchObject({ id: "link-1", url: FILE_URL, upload: true });
    expect(prisma.link.count).not.toHaveBeenCalled();
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("creates two pearls for two uploads of one file", async () => {
    const second = `${HOST}/users/u1/c2/My-Shot-x3.png`;
    vi.mocked(head).mockImplementation(async (url) =>
      url === second
        ? headResult("users/u1/c2/My-Shot-x3.png", "image/png", 123_456)
        : headResult(FILE_PATH, "image/png", 123_456),
    );
    await createUploadForUser("u1", { ...INPUT, previewUrl: null });
    await createUploadForUser("u1", { ...INPUT, url: second, previewUrl: null });
    expect(prisma.link.create).toHaveBeenCalledTimes(2);
  });

  it("files the row in an owned folder", async () => {
    mockHeads();
    await createUploadForUser("u1", INPUT, { folderId: "f1" });
    expect(assertFolderOwned).toHaveBeenCalledWith("u1", "f1");
    const { data } = vi.mocked(prisma.link.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.folderId).toBe("f1");
  });

  it("rejects a folder the user doesn't own before any head", async () => {
    vi.mocked(assertFolderOwned).mockRejectedValue(new FolderNotFoundError());
    await expect(
      createUploadForUser("u1", INPUT, { folderId: "f2" }),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
    expect(head).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("accepts an upload without a preview", async () => {
    mockHeads();
    await createUploadForUser("u1", { ...INPUT, previewUrl: null });
    expect(head).toHaveBeenCalledTimes(1);
    const { data } = vi.mocked(prisma.link.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.thumbnail).toBeNull();
  });

  it("takes the title from the name, never the blob pathname", async () => {
    mockHeads();
    await createUploadForUser("u1", { ...INPUT, name: "Holiday\u0000 photo.PNG" });
    const { data } = vi.mocked(prisma.link.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.title).toBe("Holiday photo");
  });

  it("compares MIME types lowercased, without parameters", async () => {
    mockHeads("audio/mpeg; charset=binary");
    await createUploadForUser("u1", {
      ...INPUT,
      previewUrl: null,
      mimeType: "Audio/MPEG",
      width: null,
      height: null,
      duration: 215,
    });
    const { data } = vi.mocked(prisma.link.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.mimeType).toBe("audio/mpeg");
    expect(data.contentType).toBe("AUDIO");
    expect(data.duration).toBe(215);
  });

  it("rejects a URL on another host without calling head", async () => {
    await expect(
      createUploadForUser("u1", {
        ...INPUT,
        url: `https://evil.example.com/${FILE_PATH}`,
      }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(head).not.toHaveBeenCalled();
    expect(prisma.link.create).not.toHaveBeenCalled();
  });

  it("rejects a preview URL on another host without calling head", async () => {
    await expect(
      createUploadForUser("u1", {
        ...INPUT,
        previewUrl: `https://evil.example.com/${PREVIEW_PATH}`,
      }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(head).not.toHaveBeenCalled();
  });

  it("rejects another user's prefix", async () => {
    await expect(
      createUploadForUser("u1", {
        ...INPUT,
        url: `${HOST}/users/u2/c1/My-Shot-x1.png`,
      }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    await expect(
      createUploadForUser("u1", {
        ...INPUT,
        previewUrl: `${HOST}/users/u2/c1/preview-x2.webp`,
      }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(head).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("maps a missing blob to InvalidUploadError, with no insert or del", async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rethrows any other head error (a Blob outage), with no insert or del", async () => {
    const outage = new Error("BlobServiceNotAvailable");
    vi.mocked(head).mockRejectedValue(outage);
    await expect(createUploadForUser("u1", INPUT)).rejects.toBe(outage);
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rejects a head that answers for another URL (another store), with no insert or del", async () => {
    vi.mocked(head).mockResolvedValue({
      ...headResult(FILE_PATH, "image/png", 10),
      url: `https://other.public.blob.vercel-storage.com/${FILE_PATH}`,
    });
    await expect(
      createUploadForUser("u1", { ...INPUT, previewUrl: null }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rejects a preview head that answers for another URL, with no del", async () => {
    vi.mocked(head).mockImplementation(async (url) =>
      url === PREVIEW_URL
        ? {
            ...headResult(PREVIEW_PATH, "image/webp", 10),
            url: `https://other.public.blob.vercel-storage.com/${PREVIEW_PATH}`,
          }
        : headResult(FILE_PATH, "image/png", 10),
    );
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("rejects a URL with a query, which isn't the blob's own URL", async () => {
    vi.mocked(head).mockImplementation(async () =>
      headResult(FILE_PATH, "image/png", 10),
    );
    await expect(
      createUploadForUser("u1", { ...INPUT, url: `${FILE_URL}?x=1`, previewUrl: null }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(prisma.link.create).not.toHaveBeenCalled();
  });

  it.each([
    ["the file itself", FILE_URL],
    ["another directory", `${HOST}/users/u1/c9/preview-x2.webp`],
    ["a name not starting with preview", `${HOST}/users/u1/c1/other-x2.webp`],
  ])("rejects a preview that is %s, without calling head", async (_, previewUrl) => {
    await expect(
      createUploadForUser("u1", { ...INPUT, previewUrl }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(head).not.toHaveBeenCalled();
  });

  it("rejects a preview over the preview cap and deletes the blobs", async () => {
    mockHeads("image/png", "image/webp", { previewSize: MAX_UPLOAD_PREVIEW_BYTES + 1 });
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("accepts a preview at the preview cap", async () => {
    mockHeads("image/png", "image/webp", { previewSize: MAX_UPLOAD_PREVIEW_BYTES });
    await createUploadForUser("u1", INPUT);
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty file and deletes the blobs", async () => {
    mockHeads("image/png", "image/webp", { fileSize: 0 });
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("falls back to purl.live and warns once without BASE_URL", async () => {
    vi.stubEnv("BASE_URL", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockHeads();
    await createUploadForUser("u1", INPUT);
    await createUploadForUser("u1", INPUT);
    const { data } = vi.mocked(prisma.link.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.domain).toBe("purl.live");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("rejects an unsupported type from head and deletes both blobs", async () => {
    mockHeads("image/heic");
    await expect(
      createUploadForUser("u1", { ...INPUT, mimeType: "image/heic" }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("rejects a type that differs from the client's and deletes the blobs", async () => {
    mockHeads("image/jpeg");
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("rejects a preview that isn't WebP and deletes the blobs", async () => {
    mockHeads("image/png", "image/png");
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("rejects a head pathname outside the user's prefix without deleting it", async () => {
    vi.mocked(head).mockResolvedValue(
      headResult("users/u2/c1/My-Shot-x1.png", "image/png", 10),
    );
    await expect(
      createUploadForUser("u1", { ...INPUT, previewUrl: null }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it.each([
    ["width", 0],
    ["width", -5],
    ["width", 1.5],
    ["width", Number.NaN],
    ["width", Number.POSITIVE_INFINITY],
    ["width", 100_001],
    ["height", 100_001],
    ["duration", 86_400 * 100 + 1],
    ["duration", 0],
  ])("rejects %s = %s before any head", async (field, value) => {
    await expect(
      createUploadForUser("u1", { ...INPUT, [field]: value }),
    ).rejects.toBeInstanceOf(InvalidUploadError);
    expect(head).not.toHaveBeenCalled();
  });

  it("accepts the largest allowed sizes", async () => {
    mockHeads();
    await createUploadForUser("u1", {
      ...INPUT,
      width: 100_000,
      height: 100_000,
      duration: 86_400 * 100,
    });
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });

  it("deletes the blobs and rethrows when the storage limit is reached", async () => {
    mockHeads();
    vi.mocked(prisma.link.aggregate).mockResolvedValue({
      _sum: { fileSize: MAX_UPLOAD_BYTES_PER_ACCOUNT },
    } as never);
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      StorageLimitError,
    );
    expect(prisma.link.create).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("deletes the blob and rethrows when the save limit is reached", async () => {
    mockHeads();
    vi.mocked(prisma.link.count).mockResolvedValue(1_000);
    await expect(
      createUploadForUser("u1", { ...INPUT, previewUrl: null }),
    ).rejects.toBeInstanceOf(SaveLimitError);
    expect(del).toHaveBeenCalledWith([FILE_URL]);
  });

  it("maps a folder deleted mid-save to FolderNotFoundError and deletes the blobs", async () => {
    mockHeads();
    vi.mocked(prisma.link.create).mockRejectedValue(
      Object.assign(new Error("FK"), { code: "P2003" }),
    );
    await expect(
      createUploadForUser("u1", INPUT, { folderId: "f1" }),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
    expect(del).toHaveBeenCalledWith([FILE_URL, PREVIEW_URL]);
  });

  it("rethrows the original error when del fails", async () => {
    mockHeads();
    const dbError = new Error("database down");
    vi.mocked(prisma.link.create).mockRejectedValue(dbError);
    vi.mocked(del).mockRejectedValue(new Error("blob down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createUploadForUser("u1", INPUT)).rejects.toBe(dbError);
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("leaves the blobs alone when a saved link already uses them (a retry with a bad preview)", async () => {
    mockHeads("image/png", "image/png");
    vi.mocked(prisma.link.findFirst).mockResolvedValue({ id: "link-0" } as never);
    await expect(createUploadForUser("u1", INPUT)).rejects.toBeInstanceOf(
      InvalidUploadError,
    );
    expect(prisma.link.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        OR: [
          { fileKey: FILE_PATH },
          { url: { in: [FILE_URL, PREVIEW_URL] } },
          { thumbnail: { in: [FILE_URL, PREVIEW_URL] } },
        ],
      },
      select: { id: true },
    });
    expect(del).not.toHaveBeenCalled();
  });
});

describe("parseUploadInput", () => {
  const VALID = {
    url: FILE_URL,
    previewUrl: PREVIEW_URL,
    name: "My Shot.png",
    mimeType: "image/png",
    width: 10,
    height: 20,
    duration: null,
  };

  it("returns the input when every field has the right shape", () => {
    expect(parseUploadInput(VALID)).toEqual(VALID);
  });

  it("reads missing nullable fields as null", () => {
    expect(
      parseUploadInput({ url: FILE_URL, name: "a.png", mimeType: "image/png" }),
    ).toEqual({
      url: FILE_URL,
      previewUrl: null,
      name: "a.png",
      mimeType: "image/png",
      width: null,
      height: null,
      duration: null,
    });
  });

  it.each([
    null,
    "upload",
    [VALID],
    { ...VALID, url: 1 },
    { ...VALID, url: undefined },
    { ...VALID, name: null },
    { ...VALID, mimeType: undefined },
    { ...VALID, previewUrl: 5 },
    { ...VALID, width: "10" },
    { ...VALID, height: true },
    { ...VALID, duration: {} },
  ])("returns null for %j", (value) => {
    expect(parseUploadInput(value)).toBeNull();
  });
});
