import { MAX_IMPORT_CHUNK } from "@/lib/limits";
import { LINKS_ORIGIN_HEADER } from "@/lib/realtime-constants";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionUser: mockGetSessionUser }));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

const mockImport = vi.fn();
vi.mock("@/lib/import-links", () => ({ importLinksForUser: mockImport }));

const route = await import("./route");

const RESULT = {
  imported: 2,
  duplicates: 1,
  invalid: 0,
  overLimit: 0,
  foldersCreated: 1,
  unfiledForFolderLimit: 0,
  limitReached: false,
};

const link = (url: string) => ({
  url,
  title: "T",
  folder: null,
  createdAt: null,
});

function request(body: unknown, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/links/import", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
}

describe("route config", () => {
  it("allows 60 s, longer than the 30 s transaction timeout plus its 10 s wait", () => {
    // Without an explicit limit a legacy 15 s function default would kill a
    // slow chunk before its transaction could finish, and Try again would loop.
    expect(route.maxDuration).toBe(60);
  });
});

describe("POST /api/links/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: "user-1" });
    mockImport.mockResolvedValue(RESULT);
  });

  it("returns 401 without a session and imports nothing", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await route.POST(request({ links: [link("https://a.com/")] }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockImport).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid body", JSON.stringify({ links: "nope" })],
    ["invalid JSON", "{nope"],
  ])("returns 401, not 400, for %s without a session", async (_n, raw) => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await route.POST(request(raw));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY for invalid JSON", async () => {
    const res = await route.POST(request("{nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_BODY" });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY for a bad body", async () => {
    const res = await route.POST(request({ links: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_BODY" });
  });

  it("returns 400 TOO_MANY for more than MAX_IMPORT_CHUNK links", async () => {
    const links = Array.from({ length: MAX_IMPORT_CHUNK + 1 }, (_, i) =>
      link(`https://a.com/${i}`),
    );
    const res = await route.POST(request({ links }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "TOO_MANY" });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("imports, returns the result, and broadcasts once with the origin", async () => {
    const links = [link("https://a.com/"), link("https://b.com/")];
    const res = await route.POST(
      request({ links }, { [LINKS_ORIGIN_HEADER]: "tab-1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(mockImport).toHaveBeenCalledWith("user-1", links);
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).toHaveBeenCalledWith("user-1", "tab-1");
  });

  it("returns 200 without broadcasting when nothing was imported", async () => {
    const result = { ...RESULT, imported: 0, duplicates: 2 };
    mockImport.mockResolvedValue(result);
    const res = await route.POST(request({ links: [link("https://a.com/")] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
