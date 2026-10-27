import { describe, expect, it } from "vitest";
import { classifyDrop, draggingFiles, type DropTransfer } from "./drop-classify";

type FakeFile = { name: string; type: string; size: number };

function transfer({
  files = [],
  data = {},
}: {
  files?: FakeFile[];
  data?: Record<string, string>;
}): DropTransfer<FakeFile> {
  const types = [...(files.length > 0 ? ["Files"] : []), ...Object.keys(data)];
  return {
    types,
    files,
    getData: (format) => data[format] ?? "",
  };
}

const photo = { name: "photo.png", type: "image/png", size: 120 };
const clip = { name: "clip.mp4", type: "video/mp4", size: 4096 };
const folder = { name: "Holiday", type: "", size: 0 };

describe("classifyDrop", () => {
  it("files are files, in drop order", () => {
    expect(classifyDrop(transfer({ files: [photo, clip] }))).toEqual({
      files: [photo, clip],
      folders: 0,
    });
  });

  it("files win over the text a browser adds beside them", () => {
    expect(
      classifyDrop(transfer({ files: [photo], data: { "text/plain": "photo.png" } })),
    ).toEqual({ files: [photo], folders: 0 });
  });

  it("an entry with no type and no size is a folder", () => {
    expect(classifyDrop(transfer({ files: [folder] }))).toEqual({ folder: true });
  });

  it("files dropped with a folder keep the files and count the folder", () => {
    expect(classifyDrop(transfer({ files: [folder, photo] }))).toEqual({
      files: [photo],
      folders: 1,
    });
  });

  it("an empty file with a type is still a file (validation refuses it later)", () => {
    const empty = { name: "empty.png", type: "image/png", size: 0 };
    expect(classifyDrop(transfer({ files: [empty] }))).toEqual({
      files: [empty],
      folders: 0,
    });
  });

  it("a dragged link gives its URL list, without comment lines", () => {
    expect(
      classifyDrop(
        transfer({
          data: {
            "text/uri-list": "# a comment\r\nhttps://example.com/a\r\nhttps://example.com/b\r\n",
            "text/plain": "Example A",
          },
        }),
      ),
    ).toEqual({ text: "https://example.com/a\nhttps://example.com/b" });
  });

  it("plain text is the fallback", () => {
    expect(
      classifyDrop(transfer({ data: { "text/plain": "  https://example.com  " } })),
    ).toEqual({ text: "https://example.com" });
  });

  it("an empty URL list falls back to the plain text", () => {
    expect(
      classifyDrop(
        transfer({ data: { "text/uri-list": "# nothing", "text/plain": "hello" } }),
      ),
    ).toEqual({ text: "hello" });
  });

  it("nothing usable is null", () => {
    expect(classifyDrop(transfer({}))).toBeNull();
    expect(classifyDrop(transfer({ data: { "text/plain": "   " } }))).toBeNull();
    expect(classifyDrop(null)).toBeNull();
  });
});

describe("draggingFiles", () => {
  it("is true only when the drag carries files", () => {
    expect(draggingFiles(transfer({ files: [photo] }))).toBe(true);
    expect(draggingFiles(transfer({ data: { "text/plain": "x" } }))).toBe(false);
    expect(draggingFiles(null)).toBe(false);
  });

  it("reads a DOMStringList-like types list", () => {
    const types = { length: 1, 0: "Files", item: () => "Files" } as unknown as readonly string[];
    expect(draggingFiles({ types })).toBe(true);
  });
});
