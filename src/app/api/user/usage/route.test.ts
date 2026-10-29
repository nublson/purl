import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: vi.fn(),
}));

vi.mock("@/lib/usage-summary", () => ({
  getUsageSummaryForUser: vi.fn(),
}));

const { getBrowserSessionUserId } = await import("@/lib/require-browser-session");
const { getUsageSummaryForUser } = await import("@/lib/usage-summary");
const { GET } = await import("./route");

describe("GET /api/user/usage", () => {
  beforeEach(() => {
    vi.mocked(getBrowserSessionUserId).mockReset();
    vi.mocked(getUsageSummaryForUser).mockReset();
  });

  it("answers 401 without a session", async () => {
    vi.mocked(getBrowserSessionUserId).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getUsageSummaryForUser).not.toHaveBeenCalled();
  });

  it("answers the user's usage, never cached", async () => {
    vi.mocked(getBrowserSessionUserId).mockResolvedValue("user-1");
    const summary = {
      saves: { used: 12, cap: 1000 },
      storage: { used: 2048, cap: 250 * 1024 * 1024 },
    };
    vi.mocked(getUsageSummaryForUser).mockResolvedValue(summary);

    const res = await GET();

    expect(getUsageSummaryForUser).toHaveBeenCalledWith("user-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(summary);
  });
});
