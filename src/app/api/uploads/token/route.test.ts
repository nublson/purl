import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: vi.fn(),
}));

const userLimit = vi.fn();

vi.mock("@/lib/upstash-rate-limit", () => ({
  getUploadsTokenUserRateLimiter: vi.fn(),
}));

vi.mock("@/lib/upload-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-token")>()),
  issueUploadToken: vi.fn(),
}));

vi.mock("@/lib/entitlements", async () => {
  class LimitError extends Error {}
  class StorageLimitError extends LimitError {
    readonly feature = "STORAGE_LIMIT";
  }
  return { LimitError, StorageLimitError };
});

const { getBrowserSessionUserId } = await import("@/lib/require-browser-session");
const { issueUploadToken, UploadRejectedError } = await import("@/lib/upload-token");
const { StorageLimitError } = await import("@/lib/entitlements");
const { getUploadsTokenUserRateLimiter } = await import("@/lib/upstash-rate-limit");
const { POST } = await import("./route");

const TOKEN_BODY = {
  type: "blob.generate-client-token",
  payload: {
    pathname: "users/user1/c1/a.png",
    clientPayload: JSON.stringify({ kind: "file", mimeType: "image/png", size: 10 }),
    multipart: false,
  },
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/uploads/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/uploads/token", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    vi.mocked(getBrowserSessionUserId).mockReset().mockResolvedValue("user1");
    vi.mocked(issueUploadToken).mockReset();
    userLimit.mockReset();
    vi.mocked(getUploadsTokenUserRateLimiter).mockReset().mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers 401 without a session", async () => {
    vi.mocked(getBrowserSessionUserId).mockResolvedValue(null);
    const res = await POST(post(TOKEN_BODY));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(issueUploadToken).not.toHaveBeenCalled();
  });

  it("answers 503 when uploads aren't configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const res = await POST(post(TOKEN_BODY));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Uploads aren't available here",
      code: "UPLOADS_UNAVAILABLE",
    });
    expect(issueUploadToken).not.toHaveBeenCalled();
  });

  it("never passes a client's callbackUrl on to the token", async () => {
    vi.mocked(issueUploadToken).mockResolvedValue({ clientToken: "tok" });
    const res = await POST(
      post({
        ...TOKEN_BODY,
        payload: { ...TOKEN_BODY.payload, callbackUrl: "https://evil.test/hook" },
      }),
    );
    expect(res.status).toBe(200);
    const [, body] = vi.mocked(issueUploadToken).mock.calls[0]!;
    expect(body).toEqual(TOKEN_BODY);
    expect("callbackUrl" in (body as { payload: object }).payload).toBe(false);
  });

  describe("per-user token limit", () => {
    it("answers 429 with Retry-After once the user is over it", async () => {
      vi.mocked(getUploadsTokenUserRateLimiter).mockReturnValue({
        limit: userLimit,
      } as never);
      userLimit.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });

      const res = await POST(post(TOKEN_BODY));

      expect(userLimit).toHaveBeenCalledWith("user1");
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "Too many requests" });
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(issueUploadToken).not.toHaveBeenCalled();
    });

    it("issues the token while the user is under it", async () => {
      vi.mocked(getUploadsTokenUserRateLimiter).mockReturnValue({
        limit: userLimit,
      } as never);
      userLimit.mockResolvedValue({ success: true, reset: Date.now() + 30_000 });
      vi.mocked(issueUploadToken).mockResolvedValue({ clientToken: "tok" });

      const res = await POST(post(TOKEN_BODY));

      expect(userLimit).toHaveBeenCalledWith("user1");
      expect(res.status).toBe(200);
    });

    it("is skipped without Upstash", async () => {
      vi.mocked(issueUploadToken).mockResolvedValue({ clientToken: "tok" });
      const res = await POST(post(TOKEN_BODY));
      expect(res.status).toBe(200);
      expect(userLimit).not.toHaveBeenCalled();
    });

    it("isn't counted without a session", async () => {
      vi.mocked(getUploadsTokenUserRateLimiter).mockReturnValue({
        limit: userLimit,
      } as never);
      vi.mocked(getBrowserSessionUserId).mockResolvedValue(null);
      const res = await POST(post(TOKEN_BODY));
      expect(res.status).toBe(401);
      expect(userLimit).not.toHaveBeenCalled();
    });
  });

  it.each([
    [
      "an unsigned upload-completed callback",
      {
        type: "blob.upload-completed",
        payload: { blob: { url: "https://x.public.blob.vercel-storage.com/a" } },
      },
    ],
    ["an empty object", {}],
    ["a token event without a payload", { type: "blob.generate-client-token" }],
    [
      "a token event without a pathname",
      { type: "blob.generate-client-token", payload: { clientPayload: null } },
    ],
    ["a JSON array", []],
  ])("answers 400 for %s", async (_label, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid upload event",
      code: "INVALID_BODY",
    });
    expect(issueUploadToken).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that isn't JSON", async () => {
    const res = await POST(post("{nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns the token for the signed-in user", async () => {
    vi.mocked(issueUploadToken).mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "tok",
    });
    const req = post(TOKEN_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      type: "blob.generate-client-token",
      clientToken: "tok",
    });
    expect(issueUploadToken).toHaveBeenCalledWith("user1", TOKEN_BODY, req);
  });

  it("answers 400 with the code for a rejected upload", async () => {
    vi.mocked(issueUploadToken).mockRejectedValue(
      new UploadRejectedError("UNSUPPORTED_TYPE"),
    );
    const res = await POST(post(TOKEN_BODY));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "This file type isn't supported",
      code: "UNSUPPORTED_TYPE",
    });
  });

  it("answers 403 LIMIT_REACHED when the account is full", async () => {
    const message =
      "Your 250 MB of storage is full. Delete files you no longer need to upload more.";
    vi.mocked(issueUploadToken).mockRejectedValue(new StorageLimitError(message));
    const res = await POST(post(TOKEN_BODY));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: message,
      code: "LIMIT_REACHED",
      feature: "STORAGE_LIMIT",
    });
  });
});
