import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAudioPlayerStore,
  snapshotFor,
  type AudioElementLike,
  type AudioSnapshot,
} from "./use-audio-player";

/** A stand-in `<audio>`: spies for play/pause, settable fields, real events. */
class FakeAudio extends EventTarget {
  src = "";
  currentTime = 0;
  duration = Number.NaN;
  preload = "auto";
  paused = true;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });

  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

function setup() {
  const elements: FakeAudio[] = [];
  const store = createAudioPlayerStore(() => {
    const element = new FakeAudio();
    elements.push(element);
    return element as unknown as AudioElementLike;
  });
  return { store, elements, element: () => elements[0] };
}

describe("createAudioPlayerStore", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("creates no element until the first toggle", () => {
    const { store, elements } = ctx;
    store.stop("a");
    store.restart("a");
    expect(elements).toHaveLength(0);
    expect(store.getSnapshot()).toEqual({
      id: null,
      playing: false,
      elapsed: 0,
      length: null,
      failed: false,
      failedId: null,
    });
  });

  it("loads and plays a pearl on toggle", () => {
    const { store, elements, element } = ctx;
    store.toggle("a", "/a.mp3");
    expect(elements).toHaveLength(1);
    expect(element().src).toBe("/a.mp3");
    expect(element().preload).toBe("none");
    expect(element().play).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({
      id: "a",
      playing: true,
      elapsed: 0,
      length: null,
      failed: false,
      failedId: null,
    });
  });

  it("pauses the loaded pearl on a second toggle, keeping it and its elapsed", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 12;
    element().fire("timeupdate");
    store.toggle("a", "/a.mp3");
    expect(element().pause).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: false, elapsed: 12 });
  });

  it("resumes a paused pearl where it was, without reloading", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 12;
    element().fire("timeupdate");
    store.toggle("a", "/a.mp3");
    store.toggle("a", "/a.mp3");
    expect(element().play).toHaveBeenCalledTimes(2);
    expect(element().currentTime).toBe(12);
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true, elapsed: 12 });
  });

  it("switches to another pearl from 0 in the same element", () => {
    const { store, elements, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 12;
    element().fire("timeupdate");
    store.toggle("b", "/b.mp3");
    expect(elements).toHaveLength(1);
    expect(element().src).toBe("/b.mp3");
    expect(element().currentTime).toBe(0);
    expect(store.getSnapshot()).toMatchObject({ id: "b", playing: true, elapsed: 0 });
  });

  it("reads the length once it is known and finite", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().duration = Number.POSITIVE_INFINITY;
    element().fire("loadedmetadata");
    expect(store.getSnapshot().length).toBeNull();
    element().duration = 156;
    element().fire("loadedmetadata");
    expect(store.getSnapshot().length).toBe(156);
    element().duration = 157;
    element().fire("durationchange");
    expect(store.getSnapshot().length).toBe(157);
    // A live-ish stream reporting Infinity later keeps the known length.
    element().duration = Number.POSITIVE_INFINITY;
    element().fire("durationchange");
    expect(store.getSnapshot().length).toBe(157);
  });

  it("goes idle when the file ends", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 10;
    element().fire("timeupdate");
    element().fire("ended");
    expect(store.getSnapshot()).toMatchObject({ id: null, playing: false, elapsed: 0 });
  });

  it("goes idle and failed on an error, naming the pearl; the next toggle clears it", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().fire("error");
    expect(store.getSnapshot()).toMatchObject({
      id: null,
      playing: false,
      failed: true,
      failedId: "a",
    });
    expect(snapshotFor("a", store.getSnapshot(), 10).failed).toBe(true);
    expect(snapshotFor("b", store.getSnapshot(), 10).failed).toBe(false);
    store.toggle("b", "/b.mp3");
    expect(store.getSnapshot()).toMatchObject({
      id: "b",
      playing: true,
      failed: false,
      failedId: null,
    });
    expect(snapshotFor("a", store.getSnapshot(), 10).failed).toBe(false);
  });

  it("a seek of any pearl clears the failure", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().fire("error");
    store.seek("b", "/b.mp3", 4);
    expect(store.getSnapshot()).toMatchObject({ failed: false, failedId: null });
  });

  it("counts a rejected play() as an error, but not an AbortError", async () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().play.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("cut short"), { name: "AbortError" })),
    );
    store.toggle("b", "/b.mp3");
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: "b", failed: false });

    element().play.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("no"), { name: "NotSupportedError" })),
    );
    store.toggle("c", "/c.mp3");
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({
      id: null,
      playing: false,
      failed: true,
      failedId: "c",
    });
  });

  it("follows a pause from outside (media keys), keeping the pearl and its elapsed", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 7;
    element().fire("timeupdate");
    element().paused = true;
    element().fire("pause");
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: false, elapsed: 7 });
  });

  it("ignores the pause event from its own pause, even after a quick resume", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    store.toggle("a", "/a.mp3"); // our pause(): its event arrives later
    store.toggle("a", "/a.mp3"); // resumed before it did
    element().fire("pause");
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    // The next pause from outside still counts.
    element().paused = true;
    element().fire("pause");
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: false });
  });

  it("ignores a pause event while the element plays (a stale one, after a switch)", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    store.toggle("b", "/b.mp3");
    expect(element().paused).toBe(false);
    element().fire("pause");
    expect(store.getSnapshot()).toMatchObject({ id: "b", playing: true });
  });

  it("seeks the loaded pearl in place; restart keeps playing or paused", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    store.seek("a", "/a.mp3", 30);
    expect(element().currentTime).toBe(30);
    expect(element().src).toBe("/a.mp3");
    expect(store.getSnapshot()).toMatchObject({ id: "a", elapsed: 30, playing: true });
    store.restart("a");
    expect(element().currentTime).toBe(0);
    expect(store.getSnapshot()).toMatchObject({ elapsed: 0, playing: true });

    store.toggle("a", "/a.mp3");
    store.seek("a", "/a.mp3", 20);
    expect(store.getSnapshot()).toMatchObject({ elapsed: 20, playing: false });
    store.restart("a");
    expect(store.getSnapshot()).toMatchObject({ elapsed: 0, playing: false });
  });

  it("restart of a pearl that isn't loaded does nothing", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    store.seek("a", "/a.mp3", 12);
    const before = store.getSnapshot();
    store.restart("b");
    expect(element().currentTime).toBe(12);
    expect(store.getSnapshot()).toBe(before);
  });

  it("seeking another pearl loads it paused at the time, unloading the one playing", () => {
    const { store, elements, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 9;
    element().fire("timeupdate");
    store.seek("b", "/b.mp3", 40);
    expect(elements).toHaveLength(1);
    expect(element().src).toBe("/b.mp3");
    expect(element().preload).toBe("metadata");
    expect(element().play).toHaveBeenCalledTimes(1); // only a's
    // One element: a is no longer loaded, so it reads stopped.
    expect(store.getSnapshot()).toMatchObject({ id: "b", playing: false, elapsed: 40 });
    expect(snapshotFor("a", store.getSnapshot(), 60)).toMatchObject({
      active: false,
      playing: false,
      elapsed: 0,
    });

    // Once the length is known the time is applied, clamped to it.
    element().currentTime = 0;
    element().duration = 25;
    element().fire("loadedmetadata");
    expect(element().currentTime).toBe(25);
    expect(store.getSnapshot()).toMatchObject({ id: "b", elapsed: 25, length: 25 });

    // A toggle then plays it from there.
    store.toggle("b", "/b.mp3");
    expect(element().src).toBe("/b.mp3");
    expect(element().currentTime).toBe(25);
    expect(store.getSnapshot()).toMatchObject({ id: "b", playing: true, elapsed: 25 });
  });

  it("a drag before the length is known lands on its last time", () => {
    const { store, element } = ctx;
    store.seek("b", "/b.mp3", 10);
    store.seek("b", "/b.mp3", 18);
    expect(store.getSnapshot()).toMatchObject({ id: "b", elapsed: 18 });
    element().currentTime = 0;
    element().fire("timeupdate"); // no stray 0 while it waits
    expect(store.getSnapshot().elapsed).toBe(18);
    element().duration = 60;
    element().fire("loadedmetadata");
    expect(element().currentTime).toBe(18);
    expect(store.getSnapshot()).toMatchObject({ elapsed: 18, length: 60 });
  });

  it("a toggle loads with preload none again", () => {
    const { store, element } = ctx;
    store.seek("b", "/b.mp3", 10);
    store.toggle("a", "/a.mp3");
    expect(element().preload).toBe("none");
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true, elapsed: 0 });
  });

  it("stop clears only the loaded pearl", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 9;
    element().fire("timeupdate");
    store.stop("b");
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true, elapsed: 9 });
    store.stop("a");
    expect(element().pause).toHaveBeenCalled();
    expect(element().currentTime).toBe(0);
    expect(store.getSnapshot()).toEqual({
      id: null,
      playing: false,
      elapsed: 0,
      length: null,
      failed: false,
      failedId: null,
    });
  });

  it("ignores element events while idle", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    store.stop("a");
    const idle = store.getSnapshot();
    element().currentTime = 5;
    element().fire("timeupdate");
    element().fire("error");
    expect(store.getSnapshot()).toBe(idle);
  });

  it("stops when the last view of the loaded pearl detaches", async () => {
    const { store } = ctx;
    const a1 = store.attach("a");
    const a2 = store.attach("a");
    const b1 = store.attach("b");
    store.toggle("a", "/a.mp3");
    a1();
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    b1();
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    a1(); // a second call is a no-op
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    a2();
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: null, playing: false });
  });

  it("keeps playing when one view is swapped for another in the same commit", async () => {
    const { store } = ctx;
    const card = store.attach("a");
    store.toggle("a", "/a.mp3");
    // React runs the old view's cleanup before the new view's effect.
    card();
    const player = store.attach("a");
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    player();
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ id: null, playing: false });
  });

  it("notifies subscribers with a new snapshot on each change, until they unsubscribe", () => {
    const { store, element } = ctx;
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    store.toggle("a", "/a.mp3");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    store.stop("b");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    element().fire("ended");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("snapshotFor", () => {
  const playingA: AudioSnapshot = {
    id: "a",
    playing: true,
    elapsed: 12,
    length: 156,
    failed: false,
    failedId: null,
  };

  it("maps the loaded pearl's state", () => {
    expect(snapshotFor("a", playingA, 150)).toEqual({
      active: true,
      playing: true,
      elapsed: 12,
      length: 156,
      failed: false,
    });
  });

  it("falls back to the stored length until the element knows it", () => {
    expect(snapshotFor("a", { ...playingA, length: null }, 150).length).toBe(150);
  });

  it("reads another pearl as inactive", () => {
    expect(snapshotFor("b", playingA, 42)).toEqual({
      active: false,
      playing: false,
      elapsed: 0,
      length: 42,
      failed: false,
    });
    expect(
      snapshotFor(
        "b",
        { id: null, playing: false, elapsed: 0, length: null, failed: true, failedId: "a" },
        null,
      ),
    ).toEqual({ active: false, playing: false, elapsed: 0, length: null, failed: false });
  });
});
