import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

const { getBrowserSessionUserId } = await import("./require-browser-session");

describe("getBrowserSessionUserId", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockHeaders.mockReset();
  });

  it("returns null and never calls getSession when an Authorization header is present", async () => {
    mockHeaders.mockResolvedValue(new Headers({ authorization: "Bearer purl_leaked_key" }));
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, session: {} });

    const result = await getBrowserSessionUserId();

    expect(result).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("returns null when there is no Authorization header and no session", async () => {
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue(null);

    const result = await getBrowserSessionUserId();

    expect(result).toBeNull();
    expect(mockGetSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("returns the user id from a real cookie-based session", async () => {
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, session: {} });

    const result = await getBrowserSessionUserId();

    expect(result).toBe("user-1");
  });
});
