import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: mockUpdate } },
}));

const { PATCH } = await import("./route");

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/user/link-view", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PATCH /api/user/link-view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
  });

  it("saves the view on the account", async () => {
    const res = await PATCH(patchRequest({ view: "grid" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ view: "grid" });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { linkView: "GRID" },
    });
  });

  it("rejects anything but list or grid", async () => {
    const res = await PATCH(patchRequest({ view: "cards" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_VIEW" });
    expect((await PATCH(patchRequest("nope"))).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    expect((await PATCH(patchRequest({ view: "list" }))).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
