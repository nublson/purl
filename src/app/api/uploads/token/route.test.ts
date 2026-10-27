import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: vi.fn(),
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
