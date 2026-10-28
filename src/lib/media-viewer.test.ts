import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Link } from "@/utils/links";
import { markCloseSettled, mediaViewer, onCloseSettled } from "./media-viewer";

function link(id: string, contentType: Link["contentType"] = "IMAGE"): Link {
  return { id, contentType, embed: null, title: id } as unknown as Link;
}

const ids = () => mediaViewer.getSnapshot().items.map((item) => item.id);

beforeEach(() => {
  mediaViewer.close();
  mediaViewer.register([]);
});

describe("mediaViewer", () => {
  it("unregisterPage empties and closes, marked as the page leaving, until the next register", () => {
    mediaViewer.register([link("a"), link("b")]);
    mediaViewer.open("a");
    mediaViewer.unregisterPage();
    expect(mediaViewer.getSnapshot()).toMatchObject({
      items: [],
      currentId: null,
      openedId: null,
      pageLeft: true,
    });
    mediaViewer.register([link("a")]);
    expect(mediaViewer.getSnapshot().pageLeft).toBe(false);
    mediaViewer.unregisterPage();
    mediaViewer.register([]);
    expect(mediaViewer.getSnapshot().pageLeft).toBe(false);
  });

  it("a plain register([]) while open is a close, not the page leaving", () => {
    mediaViewer.register([link("a")]);
    mediaViewer.open("a");
    mediaViewer.register([]);
    expect(mediaViewer.getSnapshot()).toMatchObject({ currentId: null, pageLeft: false });
  });

  it("registers image and video pearls only, in order (audio plays in place)", () => {
    mediaViewer.register([
      link("a", "IMAGE"),
      link("page", "WEB"),
      link("s", "AUDIO"),
      link("b", "VIDEO"),
    ]);
    expect(ids()).toEqual(["a", "b"]);
  });

  it("never opens on an audio pearl, and next/prev skip it", () => {
    mediaViewer.register([link("a"), link("s", "AUDIO"), link("c")]);
    mediaViewer.open("s");
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    mediaViewer.open("a");
    mediaViewer.next();
    expect(mediaViewer.getSnapshot().currentId).toBe("c");
    mediaViewer.prev();
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
  });

  it("open sets both ids; next/prev move currentId and clamp", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("b");
    expect(mediaViewer.getSnapshot()).toMatchObject({
      openedId: "b",
      currentId: "b",
      openedPreset: "smooth",
      standalone: false,
    });
    mediaViewer.next();
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: "b", currentId: "c" });
    mediaViewer.next();
    expect(mediaViewer.getSnapshot().currentId).toBe("c");
    mediaViewer.prev();
    mediaViewer.prev();
    mediaViewer.prev();
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
  });

  it("open takes a preset and standalone", () => {
    mediaViewer.register([link("a")]);
    mediaViewer.open("a", { preset: "snappy", standalone: true });
    expect(mediaViewer.getSnapshot()).toMatchObject({
      openedPreset: "snappy",
      standalone: true,
    });
    mediaViewer.close();
    expect(mediaViewer.getSnapshot()).toMatchObject({
      openedPreset: "smooth",
      standalone: false,
    });
  });

  it("open of an unregistered id does nothing", () => {
    mediaViewer.register([link("a")]);
    const before = mediaViewer.getSnapshot();
    mediaViewer.open("nope");
    expect(mediaViewer.getSnapshot()).toBe(before);
  });

  it("next and prev do nothing while closed", () => {
    mediaViewer.register([link("a"), link("b")]);
    const before = mediaViewer.getSnapshot();
    mediaViewer.next();
    mediaViewer.prev();
    expect(mediaViewer.getSnapshot()).toBe(before);
  });

  it("re-register drops removed ids and keeps order", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.register([link("c"), link("a")]);
    expect(ids()).toEqual(["c", "a"]);
  });

  it("re-register with the same ids replaces items without touching the open ids", () => {
    mediaViewer.register([link("a"), link("b")]);
    mediaViewer.open("b");
    mediaViewer.next();
    const before = mediaViewer.getSnapshot();
    const renamed = { ...link("b"), title: "New" } as Link;
    mediaViewer.register([link("a"), renamed]);
    const after = mediaViewer.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.items[1].title).toBe("New");
    expect(after.openedId).toBe("b");
    expect(after.currentId).toBe("b");
  });

  it("keeps the snapshot while nothing changed", () => {
    const a = link("a");
    mediaViewer.register([a]);
    const before = mediaViewer.getSnapshot();
    mediaViewer.register([a]);
    expect(mediaViewer.getSnapshot()).toBe(before);
  });

  it("removing the current pearl moves to the next, else the previous, else closes", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("b");
    mediaViewer.register([link("a"), link("c")]);
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: "b", currentId: "c" });

    mediaViewer.register([link("a")]);
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: "b", currentId: "a" });

    mediaViewer.register([]);
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: null, currentId: null });
  });

  it("removing the current pearl at the end moves to the previous", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("c");
    mediaViewer.register([link("a"), link("b")]);
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
  });

  it("removing the opened pearl after navigating leaves both ids (the dialog isn't remounted)", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("a");
    mediaViewer.next();
    mediaViewer.register([link("b"), link("c")]);
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: "a", currentId: "b" });
    // Still movable, and closing clears both.
    mediaViewer.next();
    expect(mediaViewer.getSnapshot().currentId).toBe("c");
    mediaViewer.close();
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: null, currentId: null });
  });

  it("removing a pearl that is not current leaves the ids alone", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("a");
    mediaViewer.next();
    mediaViewer.register([link("a"), link("b")]);
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: "a", currentId: "b" });
  });

  it("rapid next calls past the end stay on the last pearl", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("a");
    for (let i = 0; i < 10; i += 1) mediaViewer.next();
    expect(mediaViewer.getSnapshot().currentId).toBe("c");
  });

  it("first and last jump to the ends", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("b");
    mediaViewer.last();
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: "b", currentId: "c" });
    mediaViewer.first();
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
  });

  it("a standalone pearl has no neighbours to move to", () => {
    mediaViewer.register([link("a"), link("b"), link("c")]);
    mediaViewer.open("b", { standalone: true });
    mediaViewer.next();
    mediaViewer.prev();
    mediaViewer.first();
    mediaViewer.last();
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
  });

  it("first and last do nothing while closed", () => {
    mediaViewer.register([link("a"), link("b")]);
    mediaViewer.last();
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
  });

  it("close clears both ids but keeps items", () => {
    mediaViewer.register([link("a"), link("b")]);
    mediaViewer.open("a");
    mediaViewer.close();
    expect(mediaViewer.getSnapshot()).toMatchObject({ openedId: null, currentId: null });
    expect(ids()).toEqual(["a", "b"]);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    mediaViewer.register([link("a")]);
    const listener = vi.fn();
    const unsubscribe = mediaViewer.subscribe(listener);
    mediaViewer.open("a");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    mediaViewer.close();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tells listeners the close settled, with the pearl it morphed into, until they stop", () => {
    const listener = vi.fn();
    const stop = onCloseSettled(listener);
    markCloseSettled("b");
    expect(listener).toHaveBeenCalledWith("b");
    stop();
    markCloseSettled(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("requestClose goes through the registered close, else closes at once", () => {
    mediaViewer.register([link("a")]);
    mediaViewer.open("a");
    const request = vi.fn();
    const unregister = mediaViewer.setCloseRequest(request);
    mediaViewer.requestClose();
    expect(request).toHaveBeenCalledTimes(1);
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
    unregister();
    mediaViewer.requestClose();
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
  });

  it("unregistering an older close keeps the newer one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = mediaViewer.setCloseRequest(first);
    const stopSecond = mediaViewer.setCloseRequest(second);
    stopFirst();
    mediaViewer.requestClose();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    stopSecond();
  });
});
