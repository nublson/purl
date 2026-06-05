import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/elevenlabs", () => ({
  getElevenLabsClient: vi.fn(() => ({
    tokens: {
      singleUse: {
        create: vi.fn().mockResolvedValue({ token: "test-token-xyz" }),
      },
    },
  })),
}));

const { auth } = await import("@/lib/auth");
const { GET } = await import("./route");

describe("GET /api/scribe-token", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as any);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns a single-use token for authenticated users", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("test-token-xyz");
  });

  it("returns 500 when token creation fails", async () => {
    const { getElevenLabsClient } = await import("@/lib/elevenlabs");
    vi.mocked(getElevenLabsClient).mockReturnValueOnce({
      tokens: {
        singleUse: {
          create: vi.fn().mockRejectedValueOnce(new Error("API error")),
        },
      },
    } as any);
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
