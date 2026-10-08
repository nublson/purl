import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockReorderFolders = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>(
    "@/lib/folders",
  );
  return { ...actual, reorderFolders: mockReorderFolders };
});

const mockBroadcastLinksChanged = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcastLinksChanged,
}));

const { PUT } = await import("./route");
const { InvalidFolderOrderError } = await import("@/lib/folders");
const { MAX_FOLDERS } = await import("@/lib/limits");

function putRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/folders/order", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
}

describe("PUT /api/folders/order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
  });

  it("returns 401 without a session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await PUT(putRequest({ ids: ["a"] }));
    expect(res.status).toBe(401);
    expect(mockReorderFolders).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{"],
    ["no ids", {}],
    ["ids not an array", { ids: "a" }],
    ["non-string ids", { ids: [1] }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await PUT(putRequest(body));
    expect(res.status).toBe(400);
    expect(mockReorderFolders).not.toHaveBeenCalled();
  });

  it("rejects more ids than the folder cap before any DB work", async () => {
    const ids = Array.from({ length: MAX_FOLDERS + 1 }, (_, i) => `f${i}`);
    const res = await PUT(putRequest({ ids }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ORDER");
    expect(mockReorderFolders).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_ORDER and doesn't broadcast for a stale list", async () => {
    mockReorderFolders.mockRejectedValue(new InvalidFolderOrderError());
    const res = await PUT(putRequest({ ids: ["a"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ORDER");
    expect(mockBroadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("returns the reordered folders and broadcasts with the origin", async () => {
    const folders = [{ id: "b" }, { id: "a" }];
    mockReorderFolders.mockResolvedValue(folders);
    const res = await PUT(
      putRequest({ ids: ["b", "a"] }, { "x-purl-origin": "tab-1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders });
    expect(mockReorderFolders).toHaveBeenCalledWith("user-1", ["b", "a"]);
    expect(mockBroadcastLinksChanged).toHaveBeenCalledWith("user-1", "tab-1");
  });
});
