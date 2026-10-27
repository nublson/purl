import { describe, expect, it } from "vitest";
import {
  addPending,
  countUploading,
  removePending,
  updatePending,
  uploadingStatusText,
  type PendingUpload,
} from "./pending-upload";

function item(id: string, patch: Partial<PendingUpload> = {}): PendingUpload {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    previewUrl: null,
    progress: 0,
    status: "uploading",
    width: null,
    height: null,
    ...patch,
  };
}

describe("addPending", () => {
  it("appends in order", () => {
    const list = addPending(addPending([], item("a")), item("b"));
    expect(list.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("replaces an item with the same id in place (a retry)", () => {
    const list = [item("a"), item("b", { status: "failed" }), item("c")];
    const next = addPending(list, item("b", { progress: 0 }));
    expect(next.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(next[1].status).toBe("uploading");
  });

  it("doesn't mutate the list", () => {
    const list = [item("a")];
    addPending(list, item("b"));
    expect(list).toHaveLength(1);
  });
});

describe("updatePending", () => {
  it("patches one item and keeps order", () => {
    const list = [item("a"), item("b"), item("c")];
    const next = updatePending(list, "b", { progress: 42 });
    expect(next.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(next[1].progress).toBe(42);
    expect(list[1].progress).toBe(0);
  });

  it("returns the same list for an unknown id", () => {
    const list = [item("a")];
    expect(updatePending(list, "x", { progress: 1 })).toBe(list);
  });
});

describe("removePending", () => {
  it("removes one item and keeps order", () => {
    const list = [item("a"), item("b"), item("c")];
    expect(removePending(list, "b").map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("returns the same list for an unknown id", () => {
    const list = [item("a")];
    expect(removePending(list, "x")).toBe(list);
  });
});

describe("uploading status", () => {
  it("counts only items still uploading", () => {
    expect(
      countUploading([item("a"), item("b", { status: "failed" }), item("c")]),
    ).toBe(2);
  });

  it("reads one file and several files", () => {
    expect(uploadingStatusText(1)).toBe("Uploading 1 file");
    expect(uploadingStatusText(3)).toBe("Uploading 3 files");
  });
});
