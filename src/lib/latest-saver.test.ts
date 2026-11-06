import { describe, expect, it, vi } from "vitest";
import { createLatestSaver } from "./latest-saver";

type Deferred = { resolve: () => void; reject: (e: unknown) => void };

/** A `save` whose calls stay pending until the test settles them. */
function controlledSave() {
  const calls: { value: string; deferred: Deferred }[] = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, deferred: { resolve, reject } });
      }),
  );
  return { save, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createLatestSaver", () => {
  it("saves one at a time and ends on the latest choice", async () => {
    const { save, calls } = controlledSave();
    const saver = createLatestSaver({ confirmed: "list", save, onRevert: vi.fn() });

    saver.set("grid");
    saver.set("list");
    saver.set("grid");
    expect(save).toHaveBeenCalledTimes(1);

    calls[0].deferred.resolve();
    await flush();
    // The latest ("grid") is what the first save already confirmed.
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.confirmed()).toBe("grid");
  });

  it("saves the newer choice after the one in flight", async () => {
    const { save, calls } = controlledSave();
    const saver = createLatestSaver({ confirmed: "list", save, onRevert: vi.fn() });

    saver.set("grid");
    saver.set("list");
    calls[0].deferred.resolve();
    await flush();
    expect(save.mock.calls.map(([v]) => v)).toEqual(["grid", "list"]);
    calls[1].deferred.resolve();
    await flush();
    expect(saver.confirmed()).toBe("list");
  });

  it("skips the save when the choice returns to the confirmed value", async () => {
    const { save } = controlledSave();
    const saver = createLatestSaver({ confirmed: "list", save, onRevert: vi.fn() });
    saver.set("list");
    expect(save).not.toHaveBeenCalled();
  });

  it("reverts to the confirmed value when a save fails, and can save again", async () => {
    const { save, calls } = controlledSave();
    const onRevert = vi.fn();
    const saver = createLatestSaver({ confirmed: "list", save, onRevert });

    saver.set("grid");
    calls[0].deferred.reject(new Error("500"));
    await flush();
    expect(onRevert).toHaveBeenCalledExactlyOnceWith("list", "grid");
    expect(saver.confirmed()).toBe("list");

    saver.set("grid");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("is idle only while no save is in flight", async () => {
    const { save, calls } = controlledSave();
    const saver = createLatestSaver({ confirmed: "list", save, onRevert: vi.fn() });
    expect(saver.idle()).toBe(true);
    saver.set("grid");
    expect(saver.idle()).toBe(false);
    calls[0].deferred.resolve();
    await flush();
    expect(saver.idle()).toBe(true);
  });
});
