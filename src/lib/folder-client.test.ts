import { LINKS_CLIENT_ORIGIN } from "@/lib/links-origin";
import { LINKS_ORIGIN_HEADER } from "@/lib/realtime-constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFolders,
  patchFolder,
  patchLinkFolder,
  patchLinksFolder,
  postFolder,
  putFolderOrder,
  removeFolder,
} from "./folder-client";

describe("fetchFolders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GETs /api/folders and resolves with the folder list", async () => {
    const folders = [{ id: "f1", name: "Reading", slug: "reading", linkCount: 2 }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(folders), { status: 200 }),
    );

    const result = await fetchFolders();

    expect(fetchSpy).toHaveBeenCalledWith("/api/folders");
    expect(result).toEqual(folders);
  });

  it("throws with the body's error message on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(fetchFolders()).rejects.toThrow("Unauthorized");
  });

  it("throws the fallback message on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));

    await expect(fetchFolders()).rejects.toThrow();
  });
});

describe("postFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the name and returns ok with the created folder on 2xx", async () => {
    const folder = { id: "f1", name: "Books", slug: "books", linkCount: 0 };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(folder), { status: 201 }),
    );

    const result = await postFolder({ name: "Books" });

    expect(fetchSpy).toHaveBeenCalledWith("/api/folders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
      body: JSON.stringify({ name: "Books" }),
    });
    expect(result).toEqual({ ok: true, data: folder });
  });

  it("POSTs the emoji alongside the name when given", async () => {
    const folder = { id: "f1", name: "Books", slug: "books", emoji: "📚", linkCount: 0 };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(folder), { status: 201 }),
    );

    const result = await postFolder({ name: "Books", emoji: "📚" });

    expect(fetchSpy.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ name: "Books", emoji: "📚" }),
    );
    expect(result).toEqual({ ok: true, data: folder });
  });

  it("returns the body's error on a 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "You already have a folder with that name. Choose another." }),
        { status: 409 },
      ),
    );

    const result = await postFolder({ name: "Books" });

    expect(result).toEqual({
      ok: false,
      error: "You already have a folder with that name. Choose another.",
    });
  });

  it("returns the fallback error when the request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const result = await postFolder({ name: "Books" });

    expect(result).toEqual({
      ok: false,
      error: "Unable to create the folder. Check your connection and try again.",
    });
  });

  it("returns the fallback error when the error body has no error field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 500 }),
    );

    const result = await postFolder({ name: "Books" });

    expect(result).toEqual({
      ok: false,
      error: "Unable to create the folder. Try again.",
    });
  });
});

describe("patchFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes /api/folders/[id] with the new name", async () => {
    const folder = { id: "f1", name: "Renamed", slug: "renamed", linkCount: 2 };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(folder), { status: 200 }),
    );

    const result = await patchFolder("f1", { name: "Renamed" });

    expect(fetchSpy).toHaveBeenCalledWith("/api/folders/f1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(result).toEqual({ ok: true, data: folder });
  });

  it("PATCHes only the emoji when that's all that changed, and sends null to clear it", async () => {
    const folder = { id: "f1", name: "Books", slug: "books", emoji: "📚", linkCount: 2 };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(folder), { status: 200 }),
    );

    await patchFolder("f1", { emoji: "📚" });
    await patchFolder("f1", { emoji: null });

    expect(fetchSpy.mock.calls[0][1]?.body).toBe(JSON.stringify({ emoji: "📚" }));
    expect(fetchSpy.mock.calls[1][1]?.body).toBe(JSON.stringify({ emoji: null }));
  });

  it("returns the INVALID_EMOJI error message and code without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Pick a single emoji.", code: "INVALID_EMOJI" }),
        { status: 400 },
      ),
    );

    const result = await patchFolder("f1", { emoji: "ab" });

    expect(result).toEqual({
      ok: false,
      error: "Pick a single emoji.",
      code: "INVALID_EMOJI",
    });
  });

  it("returns 404's body error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Folder not found" }), {
        status: 404,
      }),
    );

    const result = await patchFolder("missing", { name: "Renamed" });

    expect(result).toEqual({ ok: false, error: "Folder not found" });
  });
});

describe("removeFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("DELETEs /api/folders/[id] with withLinks in the query string", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deletedLinks: 3 }), { status: 200 }),
    );

    const result = await removeFolder("f1", true);

    expect(fetchSpy).toHaveBeenCalledWith("/api/folders/f1?withLinks=true", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
    });
    expect(result).toEqual({ ok: true, data: { deletedLinks: 3 } });
  });

  it("sends withLinks=false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deletedLinks: 0 }), { status: 200 }),
    );

    await removeFolder("f1", false);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/folders/f1?withLinks=false",
      expect.anything(),
    );
  });

  it("returns the fallback error on a network throw", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));

    const result = await removeFolder("f1", true);

    expect(result).toEqual({
      ok: false,
      error: "Unable to delete the folder. Check your connection and try again.",
    });
  });
});

describe("patchLinkFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes /api/links/[id] with folderId", async () => {
    const link = { id: "l1", folderId: "f1" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(link), { status: 200 }),
    );

    const result = await patchLinkFolder("l1", "f1");

    expect(fetchSpy).toHaveBeenCalledWith("/api/links/l1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
      body: JSON.stringify({ folderId: "f1" }),
    });
    expect(result).toEqual({ ok: true, data: link });
  });

  it("sends folderId: null to unfile", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "l1", folderId: null }), {
        status: 200,
      }),
    );

    await patchLinkFolder("l1", null);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/links/l1",
      expect.objectContaining({ body: JSON.stringify({ folderId: null }) }),
    );
  });

  it("returns a 404's body error for a foreign link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );

    const result = await patchLinkFolder("l1", "f1");

    expect(result).toEqual({ ok: false, error: "Not found" });
  });
});

describe("patchLinksFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes /api/links/bulk with the ids and folderId", async () => {
    const body = { moved: [{ id: "l1", previousFolderId: null }], notFound: [] };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(body));

    const result = await patchLinksFolder(["l1"], null);

    expect(result).toEqual({ ok: true, data: body });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/links/bulk");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ ids: ["l1"], folderId: null });
    expect(new Headers(init?.headers).get(LINKS_ORIGIN_HEADER)).toBe(LINKS_CLIENT_ORIGIN);
  });

  it("returns the API's error on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "Folder not found" }, { status: 404 }),
    );
    expect(await patchLinksFolder(["l1"], "nope")).toEqual({
      ok: false,
      error: "Folder not found",
    });
  });
});

describe("putFolderOrder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("PUTs the ids to /api/folders/order with the origin header", async () => {
    const folders = [{ id: "b" }, { id: "a" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ folders }), { status: 200 }),
    );

    const result = await putFolderOrder(["b", "a"]);

    expect(fetchSpy).toHaveBeenCalledWith("/api/folders/order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
      body: JSON.stringify({ ids: ["b", "a"] }),
      // Bounded: a stalled save would hold folder updates and later saves.
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ ok: true, data: { folders } });
  });

  it("passes the API's code through on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Stale", code: "INVALID_ORDER" }), {
        status: 400,
      }),
    );

    expect(await putFolderOrder(["a"])).toEqual({
      ok: false,
      error: "Stale",
      code: "INVALID_ORDER",
    });
  });
});
