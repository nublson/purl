import { MAX_IMPORT_CHUNK } from "@/lib/limits";
import { describe, expect, it } from "vitest";
import { parseImportBody } from "./import-body";

const link = (url = "https://example.com/") => ({
  url,
  title: "Example",
  folder: null,
  createdAt: null,
});

describe("parseImportBody", () => {
  it.each([null, undefined, "x", 3, [], true])(
    "rejects a non-object body (%j)",
    (body) => {
      expect(parseImportBody(body)).toMatchObject({
        ok: false,
        code: "INVALID_BODY",
      });
    },
  );

  it.each([
    ["missing links", {}],
    ["links not an array", { links: "x" }],
    ["empty links", { links: [] }],
    ["an item that is not an object", { links: [null] }],
    ["an item without a url", { links: [{ title: "x" }] }],
    ["an item with a non-string url", { links: [{ url: 5 }] }],
  ])("rejects %s as INVALID_BODY", (_name, body) => {
    expect(parseImportBody(body)).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });

  it("accepts exactly MAX_IMPORT_CHUNK links", () => {
    const links = Array.from({ length: MAX_IMPORT_CHUNK }, () => link());
    expect(parseImportBody({ links })).toMatchObject({ ok: true });
  });

  it("rejects more than MAX_IMPORT_CHUNK links as TOO_MANY", () => {
    const links = Array.from({ length: MAX_IMPORT_CHUNK + 1 }, () => link());
    expect(parseImportBody({ links })).toMatchObject({
      ok: false,
      code: "TOO_MANY",
    });
  });

  it("accepts null or absent folder and createdAt", () => {
    const result = parseImportBody({
      links: [link(), { url: "https://a.com/", title: "A" }],
    });
    expect(result).toEqual({
      ok: true,
      links: [
        link(),
        { url: "https://a.com/", title: "A", folder: null, createdAt: null },
      ],
    });
  });

  it("keeps a folder and createdAt when given, and ignores unknown fields", () => {
    const result = parseImportBody({
      links: [
        {
          url: "https://a.com/",
          title: "A",
          folder: "Reading",
          createdAt: "2024-01-02T03:04:05.000Z",
          extra: "ignored",
        },
      ],
      other: 1,
    });
    expect(result).toEqual({
      ok: true,
      links: [
        {
          url: "https://a.com/",
          title: "A",
          folder: "Reading",
          createdAt: "2024-01-02T03:04:05.000Z",
        },
      ],
    });
  });
});
