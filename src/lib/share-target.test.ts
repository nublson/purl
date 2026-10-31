import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseShareForm,
  readShareParams,
  SHARE_PATH,
  shareLandingPath,
  stashSharedFiles,
  takeSharedFiles,
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

describe("shareLandingPath / readShareParams", () => {
  it("round-trips URLs and the files marker", () => {
    const urls = ["https://example.com/a?x=1&y=2", "https://example.org/"];
    const path = shareLandingPath({ urls, hasFiles: true });
    expect(path.startsWith("/home?")).toBe(true);
    const values = new URL(path, "http://localhost").searchParams.getAll("share");
    expect(readShareParams(values)).toEqual({ urls, files: true });
  });

  it("lands with an empty share when nothing usable was shared", () => {
    expect(shareLandingPath({ urls: [], hasFiles: false })).toBe("/home?share=");
    expect(readShareParams([""])).toEqual({ urls: [], files: false });
  });

  it("ignores values that are neither a URL nor the marker", () => {
    expect(readShareParams(["javascript:alert(1)", "files", "example.com"])).toEqual({
      urls: [],
      files: true,
    });
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

  it("gives the files back once, in order, with their names and types", async () => {
    (globalThis as { caches?: unknown }).caches = fakeCaches;
    const photo = new File(["img"], "photo.jpg", { type: "image/jpeg", lastModified: 5 });
    const clip = new File(["mov"], "clip.mov", { type: "video/quicktime", lastModified: 6 });
    await stashSharedFiles([photo, clip]);

    const taken = await takeSharedFiles();
    expect(taken.map((file) => [file.name, file.type, file.lastModified])).toEqual([
      ["photo.jpg", "image/jpeg", 5],
      ["clip.mov", "video/quicktime", 6],
    ]);
    expect(await taken[1].text()).toBe("mov");
    expect(await takeSharedFiles()).toEqual([]);
  });

  it("is empty without the Cache API", async () => {
    expect(await takeSharedFiles()).toEqual([]);
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
