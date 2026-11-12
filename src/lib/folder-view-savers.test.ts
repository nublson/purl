import { describe, expect, it, vi } from "vitest";
import { folderViewSaver, withFolderView } from "./folder-view-savers";
import type { FolderSummary } from "./folders";
import { createLatestSaver } from "./latest-saver";

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeSaver(save: (v: string | null) => Promise<void>) {
  return () => createLatestSaver<string | null>({ confirmed: null, save, onRevert: vi.fn() });
}

describe("folderViewSaver", () => {
  it("hands every caller the same saver while a save is in flight", async () => {
    let release!: () => void;
    const save = vi.fn<(value: string | null) => Promise<void>>(
      () => new Promise<void>((r) => (release = r)),
    );
    // The user menu's instance starts a save…
    const first = folderViewSaver("folder-busy", makeSaver(save));
    first.set("grid");
    // …and the Share popover's instance, mounted later, gets the same one,
    // so its choice queues behind the first instead of racing it.
    const second = folderViewSaver("folder-busy", makeSaver(save));
    expect(second).toBe(first);
    second.set("list");
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(save.mock.calls.map(([v]) => v)).toEqual(["grid", "list"]);
  });

  it("starts a fresh saver once the folder's saves are done", async () => {
    const save = vi.fn<(value: string | null) => Promise<void>>(() => Promise.resolve());
    const first = folderViewSaver("folder-idle", makeSaver(save));
    first.set("grid");
    await flush();
    expect(folderViewSaver("folder-idle", makeSaver(save))).not.toBe(first);
  });

  it("builds a new saver from the folder's current view after the last save", async () => {
    const save = vi.fn<(value: string | null) => Promise<void>>(() => Promise.resolve());
    const makeA = vi.fn(makeSaver(save));
    const makeB = vi.fn(makeSaver(save));
    folderViewSaver("folder-rebuild", makeA).set("grid");
    await flush();
    folderViewSaver("folder-rebuild", makeB);
    expect(makeA).toHaveBeenCalledTimes(1);
    expect(makeB).toHaveBeenCalledTimes(1);
  });
});

describe("withFolderView", () => {
  const folder = (id: string, over: Partial<FolderSummary> = {}): FolderSummary => ({
    id,
    name: id,
    slug: id,
    emoji: "🦪",
    description: null,
    isPublic: false,
    position: 1,
    view: null,
    linkCount: 0,
    ...over,
  });

  it("changes only the view, keeping newer changes to the folder", () => {
    // Shared meanwhile: reverting the view must not unshare it on screen.
    const current = [folder("a", { isPublic: true, view: "grid" }), folder("b")];
    const next = withFolderView(current, "a", null);
    expect(next[0]).toEqual({ ...current[0], view: null });
    expect(next[1]).toBe(current[1]);
  });

  it("never adds back a folder that's gone", () => {
    const current = [folder("b")];
    expect(withFolderView(current, "a", "grid")).toBe(current);
  });
});
