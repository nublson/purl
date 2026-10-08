import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({
  getSessionUser: mockGetSessionUser,
}));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

const mockReorderFolders = vi.fn();
vi.mock("@/lib/folders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/folders")>(
    "@/lib/folders",
  );
  return { ...actual, reorderFolders: mockReorderFolders };
});

const { PUT, OPTIONS } = await import("./route");
const { InvalidFolderOrderError } = await import("@/lib/folders");

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/folders/order", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PUT /api/v1/folders/order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns 401 without a key", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await PUT(putRequest({ ids: ["a"] }));
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
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
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockReorderFolders).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_ORDER for a stale list", async () => {
    mockReorderFolders.mockRejectedValue(new InvalidFolderOrderError());
    const res = await PUT(putRequest({ ids: ["a"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ORDER");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("returns the reordered folders with CORS and broadcasts", async () => {
    const folders = [{ id: "b" }, { id: "a" }];
    mockReorderFolders.mockResolvedValue(folders);
    const res = await PUT(putRequest({ ids: ["b", "a"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockReorderFolders).toHaveBeenCalledWith("user-1", ["b", "a"]);
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
  });
});

describe("OPTIONS /api/v1/folders/order", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/v1/folders/order", {
        method: "OPTIONS",
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  });
});
