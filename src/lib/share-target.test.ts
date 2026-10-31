import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseShareForm,
  parseSharePayload,
  SHARE_LANDING,
  SHARE_PATH,
  shareCookie,
  stashShare,
  takeShare,
} from "./share-target";
import { UPLOAD_MIME_TYPES } from "./uploads/mime";

function form(fields: Record<string, string | File | File[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      data.append(name, entry);
    }
  }
  return data;
}

describe("parseShareForm", () => {
  it("takes the url field when it is an http(s) URL", () => {
    expect(
      parseShareForm(form({ url: " https://example.com/a?b=1 ", text: "https://other.test" })),
    ).toEqual({ urls: ["https://example.com/a?b=1"], files: [] });
  });

  it("finds the URLs in the text when there is no url field, prose and all", () => {
    const { urls } = parseShareForm(
      form({
        title: "https://ignored.test",
        text: "Look at this: https://example.com/post. And https://example.org/x, too (https://example.com/post).",
      }),
    );
    expect(urls).toEqual(["https://example.com/post", "https://example.org/x"]);
  });

  it("keeps a closing parenthesis that belongs to the URL", () => {
    const wiki = "https://en.wikipedia.org/wiki/Clojure_(programming_language)";
    expect(parseShareForm(form({ text: `Read ${wiki}.` })).urls).toEqual([wiki]);
    expect(parseShareForm(form({ text: `(see ${wiki})` })).urls).toEqual([wiki]);
    expect(parseShareForm(form({ text: "(and https://example.com/a)." })).urls).toEqual([
      "https://example.com/a",
    ]);
  });

  it("falls back to the title, and to nothing", () => {
    expect(parseShareForm(form({ title: "A page https://example.com" })).urls).toEqual([
      "https://example.com/",
    ]);
    expect(parseShareForm(form({ text: "just words, example.com too" })).urls).toEqual([]);
    expect(parseShareForm(form({ url: "ftp://example.com/f" })).urls).toEqual([]);
  });

  it("keeps the non-empty files", () => {
    const photo = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const empty = new File([], "empty.png", { type: "image/png" });
    const { files } = parseShareForm(form({ files: [photo, empty], text: "" }));
    expect(files).toEqual([photo]);
  });
});

describe("the landing and the payload", () => {
  it("lands on Home with a flag only, never the links", () => {
    expect(SHARE_LANDING).toBe("/home?share=1");
  });

  it("reads a payload back, checked", () => {
    expect(
      parseSharePayload(
        JSON.stringify({ urls: ["https://example.com/a", "javascript:x", 3], fileCount: 2 }),
      ),
    ).toEqual({ urls: ["https://example.com/a"], fileCount: 2 });
    expect(parseSharePayload("not json")).toBeNull();
    expect(parseSharePayload(JSON.stringify({ urls: "x", fileCount: 0 }))).toBeNull();
    expect(parseSharePayload(JSON.stringify({ urls: [], fileCount: -1 }))).toBeNull();
    expect(parseSharePayload(null)).toBeNull();
  });
});

describe("the cookie", () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("hands the share to the page once, same-origin and short-lived", async () => {
    const cookie = shareCookie(
      { urls: ["https://example.com/a?x=1&y=2"], files: [new File(["f"], "f.png")] },
      { secure: true },
    );
    expect(cookie).toMatch(/^purl-share=[^;]+; Path=\/; Max-Age=60; SameSite=Lax; Secure$/);
    // The value is one encoded token: no raw separators or quotes.
    expect(cookie.split(";")[0].slice("purl-share=".length)).toMatch(/^[A-Za-z0-9%._~-]+$/);

    // The browser's cookie jar, as far as the page reads and clears it.
    const jar = { value: cookie.split(";")[0] };
    (globalThis as { document?: unknown }).document = {
      get cookie() {
        return jar.value;
      },
      set cookie(update: string) {
        if (update.includes("Max-Age=0")) jar.value = "";
      },
    };

    expect(await takeShare()).toEqual({
      urls: ["https://example.com/a?x=1&y=2"],
      fileCount: 1,
      files: [],
    });
    expect(await takeShare()).toBeNull();
  });
});

describe("the stash", () => {
  // The Cache API, as far as the stash uses it: named caches of Responses.
  const stores = new Map<string, Map<string, Response>>();
  const fakeCaches = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        put: async (key: string, response: Response) => {
          store.set(new URL(key, "http://localhost").href, response);
        },
        keys: async () => [...store.keys()].map((url) => ({ url })),
        match: async (request: { url: string }) => store.get(request.url),
      };
    },
    delete: async (name: string) => stores.delete(name),
  };

  afterEach(() => {
    stores.clear();
    delete (globalThis as { caches?: unknown }).caches;
  });

  it("gives the share back once, files in order with their names and types", async () => {
    (globalThis as { caches?: unknown }).caches = fakeCaches;
    const photo = new File(["img"], "photo.jpg", { type: "image/jpeg", lastModified: 5 });
    const clip = new File(["mov"], "clip.mov", { type: "video/quicktime", lastModified: 6 });
    await stashShare({ urls: ["https://example.com/"], files: [photo, clip] });

    const taken = await takeShare();
    expect(taken?.urls).toEqual(["https://example.com/"]);
    expect(taken?.fileCount).toBe(2);
    expect(taken?.files.map((file) => [file.name, file.type, file.lastModified])).toEqual([
      ["photo.jpg", "image/jpeg", 5],
      ["clip.mov", "video/quicktime", 6],
    ]);
    expect(await taken!.files[1].text()).toBe("mov");
    expect(await takeShare()).toBeNull();
  });

  it("is nothing without the Cache API, or when reading it fails", async () => {
    expect(await takeShare()).toBeNull();
    (globalThis as { caches?: unknown }).caches = {
      open: async () => {
        throw new Error("storage");
      },
    };
    expect(await takeShare()).toBeNull();
  });
});

describe("the manifest", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "manifest.json"), "utf-8"),
  ) as {
    share_target: {
      action: string;
      method: string;
      enctype: string;
      params: { title: string; text: string; url: string; files: { name: string; accept: string[] }[] };
    };
  };

  it("posts the share form to the route, with every upload type", () => {
    const { share_target } = manifest;
    expect(share_target.action).toBe(SHARE_PATH);
    expect(share_target.method).toBe("POST");
    expect(share_target.enctype).toBe("multipart/form-data");
    expect(share_target.params.title).toBe("title");
    expect(share_target.params.text).toBe("text");
    expect(share_target.params.url).toBe("url");
    expect(share_target.params.files).toEqual([
      { name: "files", accept: [...UPLOAD_MIME_TYPES] },
    ]);
  });
});
