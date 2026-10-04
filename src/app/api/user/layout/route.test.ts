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
  return new NextRequest("http://localhost/api/user/layout", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PATCH /api/user/layout", () => {
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

  it("saves folder tags, alone or with the view", async () => {
    await PATCH(patchRequest({ folderTags: true }));
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: "user-1" },
      data: { showFolderTags: true },
    });
    await PATCH(patchRequest({ view: "list", folderTags: false }));
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: "user-1" },
      data: { linkView: "LIST", showFolderTags: false },
    });
  });

  it("rejects an empty or invalid change", async () => {
    for (const body of [{}, { view: "cards" }, { folderTags: "yes" }, "nope"]) {
      const res = await PATCH(patchRequest(body));
      expect(res.status).toBe(400);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    expect((await PATCH(patchRequest({ view: "list" }))).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
