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
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();

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
    store.seek(3);
    store.restart();
    expect(elements).toHaveLength(0);
    expect(store.getSnapshot()).toEqual({
      id: null,
      playing: false,
      elapsed: 0,
      length: null,
      failed: false,
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
  });

  it("goes idle when the file ends", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 10;
    element().fire("timeupdate");
    element().fire("ended");
    expect(store.getSnapshot()).toMatchObject({ id: null, playing: false, elapsed: 0 });
  });

  it("goes idle and failed on an error; the next toggle clears failed", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().fire("error");
    expect(store.getSnapshot()).toMatchObject({ id: null, playing: false, failed: true });
    store.toggle("b", "/b.mp3");
    expect(store.getSnapshot()).toMatchObject({ id: "b", playing: true, failed: false });
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
    expect(store.getSnapshot()).toMatchObject({ id: null, playing: false, failed: true });
  });

  it("follows a pause from outside (media keys), keeping the pearl and its elapsed", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    element().currentTime = 7;
    element().fire("timeupdate");
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
    element().fire("pause");
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: false });
  });

  it("seeks the loaded pearl only; restart keeps playing or paused", () => {
    const { store, element } = ctx;
    store.toggle("a", "/a.mp3");
    store.seek(30);
    expect(element().currentTime).toBe(30);
    expect(store.getSnapshot()).toMatchObject({ id: "a", elapsed: 30, playing: true });
    store.restart();
    expect(element().currentTime).toBe(0);
    expect(store.getSnapshot()).toMatchObject({ elapsed: 0, playing: true });

    store.toggle("a", "/a.mp3");
    store.seek(20);
    store.restart();
    expect(store.getSnapshot()).toMatchObject({ elapsed: 0, playing: false });

    store.stop("a");
    store.seek(40);
    expect(element().currentTime).toBe(0);
    expect(store.getSnapshot()).toMatchObject({ id: null, elapsed: 0 });
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

  it("stops when the last view of the loaded pearl detaches", () => {
    const { store } = ctx;
    const a1 = store.attach("a");
    const a2 = store.attach("a");
    const b1 = store.attach("b");
    store.toggle("a", "/a.mp3");
    a1();
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    b1();
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    a1(); // a second call is a no-op
    expect(store.getSnapshot()).toMatchObject({ id: "a", playing: true });
    a2();
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
        { id: null, playing: false, elapsed: 0, length: null, failed: true },
        null,
      ),
    ).toEqual({ active: false, playing: false, elapsed: 0, length: null, failed: false });
  });
});
