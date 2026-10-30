import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandleUploadBody } from "@vercel/blob/client";

vi.mock("@vercel/blob/client", () => ({
  // The token itself is the SDK's job: here it just hands back the options
  // Purl chose, so the tests can read them.
  handleUpload: vi.fn(
    async ({
      body,
      onBeforeGenerateToken,
    }: {
      body: HandleUploadBody;
      onBeforeGenerateToken: (
        pathname: string,
        clientPayload: string | null,
        multipart: boolean,
      ) => Promise<unknown>;
    }) => {
      if (body.type !== "blob.generate-client-token") throw new Error("unexpected");
      return onBeforeGenerateToken(
        body.payload.pathname,
        body.payload.clientPayload,
        body.payload.multipart,
      );
    },
  ),
}));

vi.mock("@/lib/entitlements", async () => {
  class LimitError extends Error {}
  class SaveLimitError extends LimitError {
    readonly feature = "SAVE_LIMIT";
  }
  class StorageLimitError extends LimitError {
    readonly feature = "STORAGE_LIMIT";
  }
  return {
    LimitError,
    SaveLimitError,
    StorageLimitError,
    assertCanSaveLink: vi.fn(),
    assertCanStore: vi.fn(),
  };
});

const { assertCanSaveLink, assertCanStore, StorageLimitError, SaveLimitError } =
  await import("@/lib/entitlements");
const { issueUploadToken, UploadRejectedError } = await import("./upload-token");
const { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_PREVIEW_BYTES } = await import("@/lib/limits");

const USER = "user1";
const request = new Request("http://localhost/api/uploads/token", { method: "POST" });

type TokenOptions = {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
  addRandomSuffix: boolean;
  validUntil: number;
  tokenPayload: string;
};

function body(pathname: string, clientPayload: unknown): HandleUploadBody {
  return {
    type: "blob.generate-client-token",
    payload: {
      pathname,
      clientPayload:
        typeof clientPayload === "string" || clientPayload === null
          ? clientPayload
          : JSON.stringify(clientPayload),
      multipart: false,
    },
  };
}

async function issue(pathname: string, clientPayload: unknown) {
  return (await issueUploadToken(USER, body(pathname, clientPayload), request)) as TokenOptions;
}

async function rejection(pathname: string, clientPayload: unknown) {
  const error = await issue(pathname, clientPayload).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UploadRejectedError);
  return (error as InstanceType<typeof UploadRejectedError>).code;
}

describe("issueUploadToken", () => {
  beforeEach(() => {
    vi.mocked(assertCanSaveLink).mockReset().mockResolvedValue(undefined);
    vi.mocked(assertCanStore).mockReset().mockResolvedValue(undefined);
  });

  it("allows exactly the file's type and size, with a random suffix, for 10 minutes", async () => {
    const before = Date.now();
    const options = await issue(`users/${USER}/c1/photo.png`, {
      kind: "file",
      mimeType: "image/png",
      size: 1234,
    });

    expect(options.allowedContentTypes).toEqual(["image/png"]);
    expect(options.maximumSizeInBytes).toBe(1234);
    expect(options.addRandomSuffix).toBe(true);
    expect(options.validUntil).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(options.validUntil).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    expect(JSON.parse(options.tokenPayload)).toEqual({ userId: USER });
    expect(assertCanSaveLink).toHaveBeenCalledWith(USER);
    expect(assertCanStore).toHaveBeenCalledWith(USER, 1234);
  });

  it("allows a file of exactly the size cap", async () => {
    const options = await issue(`users/${USER}/c1/clip.mp4`, {
      kind: "file",
      mimeType: "video/mp4",
      size: MAX_UPLOAD_FILE_BYTES,
    });
    expect(options.maximumSizeInBytes).toBe(MAX_UPLOAD_FILE_BYTES);
  });

  it("rejects another user's path", async () => {
    expect(
      await rejection("users/other/c/a.png", {
        kind: "file",
        mimeType: "image/png",
        size: 10,
      }),
    ).toBe("INVALID_PATH");
    expect(assertCanStore).not.toHaveBeenCalled();
  });

  it("rejects a path that escapes the user's folder", async () => {
    expect(
      await rejection(`users/${USER}/../other/a.png`, {
        kind: "file",
        mimeType: "image/png",
        size: 10,
      }),
    ).toBe("INVALID_PATH");
  });

  it.each([
    ["directly under the user's folder", `users/${USER}/a.png`],
    ["nested a level too deep", `users/${USER}/a/b/c.png`],
  ])("rejects a path %s", async (_label, pathname) => {
    expect(
      await rejection(pathname, { kind: "file", mimeType: "image/png", size: 10 }),
    ).toBe("INVALID_PATH");
  });

  it("rejects a type that isn't allowed", async () => {
    expect(
      await rejection(`users/${USER}/c1/photo.heic`, {
        kind: "file",
        mimeType: "image/heic",
        size: 10,
      }),
    ).toBe("UNSUPPORTED_TYPE");
  });

  it("rejects a file over the size cap", async () => {
    expect(
      await rejection(`users/${USER}/c1/clip.mov`, {
        kind: "file",
        mimeType: "video/quicktime",
        size: MAX_UPLOAD_FILE_BYTES + 1,
      }),
    ).toBe("FILE_TOO_LARGE");
    expect(assertCanStore).not.toHaveBeenCalled();
  });

  it.each([0, -5])("rejects a size of %d", async (size) => {
    expect(
      await rejection(`users/${USER}/c1/a.png`, {
        kind: "file",
        mimeType: "image/png",
        size,
      }),
    ).toBe("FILE_TOO_LARGE");
  });

  it.each([
    ["not JSON", "{nope"],
    ["no payload", null],
    ["a JSON array", "[]"],
    ["an unknown kind", { kind: "folder", mimeType: "image/png", size: 10 }],
    ["no mimeType", { kind: "file", size: 10 }],
    ["a string size", { kind: "file", mimeType: "image/png", size: "10" }],
    ["a fractional size", { kind: "file", mimeType: "image/png", size: 1.5 }],
    ["an infinite size", '{"kind":"file","mimeType":"image/png","size":1e999}'],
  ])("rejects %s as an invalid payload", async (_label, clientPayload) => {
    expect(await rejection(`users/${USER}/c1/a.png`, clientPayload)).toBe(
      "INVALID_PAYLOAD",
    );
  });

  it("lets a full account's storage error through", async () => {
    vi.mocked(assertCanStore).mockRejectedValue(
      new StorageLimitError("Your 250 MB of storage is full."),
    );
    await expect(
      issue(`users/${USER}/c1/a.png`, { kind: "file", mimeType: "image/png", size: 10 }),
    ).rejects.toBeInstanceOf(StorageLimitError);
  });

  it("lets the link cap's error through", async () => {
    vi.mocked(assertCanSaveLink).mockRejectedValue(new SaveLimitError("full"));
    await expect(
      issue(`users/${USER}/c1/a.png`, { kind: "file", mimeType: "image/png", size: 10 }),
    ).rejects.toBeInstanceOf(SaveLimitError);
    expect(assertCanStore).not.toHaveBeenCalled();
  });

  describe("previews", () => {
    it("never checks the link cap or storage", async () => {
      const options = await issue(`users/${USER}/c1/preview.webp`, {
        kind: "preview",
        mimeType: "image/webp",
        size: 5000,
      });
      expect(options.allowedContentTypes).toEqual(["image/webp"]);
      expect(options.maximumSizeInBytes).toBe(5000);
      expect(assertCanSaveLink).not.toHaveBeenCalled();
      expect(assertCanStore).not.toHaveBeenCalled();
    });

    it("may be JPEG (Safari can't encode WebP)", async () => {
      const options = await issue(`users/${USER}/c1/preview.jpg`, {
        kind: "preview",
        mimeType: "image/jpeg",
        size: 10,
      });
      expect(options.allowedContentTypes).toEqual(["image/jpeg"]);
    });

    it("may be PNG (a transparent image on Safari)", async () => {
      const options = await issue(`users/${USER}/c1/preview.png`, {
        kind: "preview",
        mimeType: "image/png",
        size: 10,
      });
      expect(options.allowedContentTypes).toEqual(["image/png"]);
    });

    it("must be WebP, PNG or JPEG", async () => {
      expect(
        await rejection(`users/${USER}/c1/preview.webp`, {
          kind: "preview",
          mimeType: "image/gif",
          size: 10,
        }),
      ).toBe("UNSUPPORTED_TYPE");
    });

    it("must be named preview", async () => {
      expect(
        await rejection(`users/${USER}/c1/photo.webp`, {
          kind: "preview",
          mimeType: "image/webp",
          size: 10,
        }),
      ).toBe("INVALID_PATH");
    });

    it("may be up to the preview cap", async () => {
      expect(MAX_UPLOAD_PREVIEW_BYTES).toBe(2 * 1024 * 1024);
      const options = await issue(`users/${USER}/c1/preview.webp`, {
        kind: "preview",
        mimeType: "image/webp",
        size: MAX_UPLOAD_PREVIEW_BYTES,
      });
      expect(options.maximumSizeInBytes).toBe(MAX_UPLOAD_PREVIEW_BYTES);
    });

    it("is rejected over the preview cap", async () => {
      expect(
        await rejection(`users/${USER}/c1/preview.webp`, {
          kind: "preview",
          mimeType: "image/webp",
          size: MAX_UPLOAD_PREVIEW_BYTES + 1,
        }),
      ).toBe("FILE_TOO_LARGE");
    });

    it("must sit in an upload's folder", async () => {
      expect(
        await rejection(`users/${USER}/preview.webp`, {
          kind: "preview",
          mimeType: "image/webp",
          size: 10,
        }),
      ).toBe("INVALID_PATH");
    });
  });
});
