import { describe, expect, it, vi } from "vitest";
import { folderViewSaver } from "./folder-view-savers";
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
});
