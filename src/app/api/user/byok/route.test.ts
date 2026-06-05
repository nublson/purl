import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";

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

vi.mock("@/lib/user-anthropic-key", () => ({
  getByokKey: vi.fn(),
  getDecryptedByokKey: vi.fn(),
  maskByokKey: vi.fn((key: string) => `${key.slice(0, 10)}...masked`),
  saveByokKey: vi.fn(),
  deleteByokKey: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const {
  deleteByokKey,
  getByokKey,
  getDecryptedByokKey,
  maskByokKey,
  saveByokKey,
} = await import("@/lib/user-anthropic-key");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };
const VALID_KEY = "sk-ant-api03-abcdefghijklmnopqrst";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/user/byok", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(getByokKey).mockReset();
    vi.mocked(getDecryptedByokKey).mockReset();
    vi.mocked(maskByokKey).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getByokKey).not.toHaveBeenCalled();
  });

  it("returns hasKey false when no key is stored", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(getByokKey).mockResolvedValue({ hasKey: false, encryptedKey: null });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasKey: false, maskedKey: null });
    expect(getDecryptedByokKey).not.toHaveBeenCalled();
  });

  it("returns masked key when a key is stored", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(getByokKey).mockResolvedValue({
      hasKey: true,
      encryptedKey: "encrypted",
    });
    vi.mocked(getDecryptedByokKey).mockResolvedValue(VALID_KEY);
    vi.mocked(maskByokKey).mockReturnValue("sk-ant-api...qrst");

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      hasKey: true,
      maskedKey: "sk-ant-api...qrst",
    });
    expect(getDecryptedByokKey).toHaveBeenCalledWith("user-123");
    expect(maskByokKey).toHaveBeenCalledWith(VALID_KEY);
  });
});

describe("POST /api/user/byok", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(saveByokKey).mockReset();
    vi.mocked(maskByokKey).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await POST(postRequest({ key: VALID_KEY }));

    expect(res.status).toBe(401);
    expect(saveByokKey).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const res = await POST(
      new NextRequest("http://localhost/api/user/byok", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });

  it("returns 400 when key is missing or blank", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const res = await POST(postRequest({ key: "   " }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Key is required" });
    expect(saveByokKey).not.toHaveBeenCalled();
  });

  it("returns 400 when saveByokKey rejects the key format", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(saveByokKey).mockRejectedValue(
      new Error("Key must start with sk-ant- and be at least 20 characters"),
    );

    const res = await POST(postRequest({ key: "bad-key" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Key must start with sk-ant- and be at least 20 characters",
    });
  });

  it("saves a valid key and returns the masked value", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(saveByokKey).mockResolvedValue(undefined);
    vi.mocked(maskByokKey).mockReturnValue("sk-ant-api...qrst");

    const res = await POST(postRequest({ key: `  ${VALID_KEY}  ` }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ maskedKey: "sk-ant-api...qrst" });
    expect(saveByokKey).toHaveBeenCalledWith("user-123", VALID_KEY);
  });
});

describe("DELETE /api/user/byok", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(deleteByokKey).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(deleteByokKey).not.toHaveBeenCalled();
  });

  it("deletes the stored key and returns 204", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(deleteByokKey).mockResolvedValue(undefined);

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(deleteByokKey).toHaveBeenCalledWith("user-123");
  });
});
