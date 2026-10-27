import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Link } from "@/utils/links";
import { mediaViewer } from "./media-viewer";
import {
  ViewerUrl,
  bindViewerUrl,
  forgetPushedEntry,
  pearlParam,
  withPearl,
  withoutPearl,
  type HistoryLike,
  type ViewerUrlBinder,
} from "./media-viewer-url";

function link(id: string): Link {
  return { id, contentType: "IMAGE", embed: null, title: id } as unknown as Link;
}

/**
 * A fake history over a stack of entries, like the browser's: `back()` and
 * `forward()` move the index and then fire `onPop` (the popstate listener).
 */
function fake(initial: string) {
  const state = {
    entries: [initial],
    index: 0,
    onPop: null as null | (() => void),
    get href() {
      return this.entries[this.index];
    },
    set href(value: string) {
      this.entries[this.index] = value;
    },
  };
  const history = {
    pushState: vi.fn((url: string) => {
      state.entries.splice(state.index + 1, Infinity, url);
      state.index += 1;
    }),
    replaceState: vi.fn((url: string) => {
      state.entries[state.index] = url;
    }),
    back: vi.fn(() => {
      state.index -= 1;
      state.onPop?.();
    }),
  } satisfies HistoryLike;
  const forward = () => {
    state.index += 1;
    state.onPop?.();
  };
  const getSearch = () => new URL(state.href, "http://x").search;
  const viewerUrl = new ViewerUrl(history, () => state.href);
  return { state, history, viewerUrl, forward, getSearch };
}

/**
 * Every binder a test binds, disposed after it: one left subscribed by a
 * failed assertion would act on the next test's store changes.
 */
const bound: ViewerUrlBinder[] = [];
function track(binder: ViewerUrlBinder) {
  bound.push(binder);
  return binder;
}
afterEach(() => {
  for (const binder of bound.splice(0)) binder.dispose();
});

/** A fake page: history + the bound store, as the hook wires them. */
function page(initial: string, ids: string[] = ["a", "b", "c"]) {
  const f = fake(initial);
  mediaViewer.register(ids.map(link));
  const pending: Array<string | null> = [];
  const binder = track(
    bindViewerUrl(mediaViewer, f.viewerUrl, f.getSearch, (id) => pending.push(id)),
  );
  f.state.onPop = () => binder.onPopState();
  return { ...f, binder, pending };
}

beforeEach(() => {
  mediaViewer.close();
  mediaViewer.register([]);
  forgetPushedEntry();
});

describe("pearl URL helpers", () => {
  it("reads the param from a search string", () => {
    expect(pearlParam("?pearl=abc")).toBe("abc");
    expect(pearlParam("?settings=usage&pearl=abc")).toBe("abc");
    expect(pearlParam("")).toBeNull();
    expect(pearlParam("?pearl=")).toBeNull();
    expect(pearlParam("?settings=usage")).toBeNull();
  });

  it("adds the param and keeps the rest", () => {
    expect(withPearl("/home", "abc")).toBe("/home?pearl=abc");
    expect(withPearl("/home?settings=usage", "abc")).toBe("/home?settings=usage&pearl=abc");
    expect(withPearl("/home?pearl=old", "abc")).toBe("/home?pearl=abc");
    expect(withPearl("/folders/x?a=1#top", "abc")).toBe("/folders/x?a=1&pearl=abc#top");
  });

  it("removes only the param, dropping an empty query", () => {
    expect(withoutPearl("/home?pearl=abc")).toBe("/home");
    expect(withoutPearl("/home?pearl=abc&settings=usage")).toBe("/home?settings=usage");
    expect(withoutPearl("/home?settings=usage")).toBe("/home?settings=usage");
    expect(withoutPearl("/home")).toBe("/home");
  });
});

describe("ViewerUrl", () => {
  it("open pushes once", () => {
    const { history, state, viewerUrl } = fake("/home?settings=usage");
    viewerUrl.open("a");
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(state.href).toBe("/home?settings=usage&pearl=a");
  });

  it("open when the href already has that pearl pushes nothing", () => {
    const { history, viewerUrl } = fake("/home?pearl=a");
    viewerUrl.open("a");
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it("navigate replaces, every time", () => {
    const { history, state, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    viewerUrl.navigate("b");
    viewerUrl.navigate("c");
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledTimes(2);
    expect(state.href).toBe("/home?pearl=c");
  });

  it("close after a push goes back once, even after navigating between pearls", () => {
    const { history, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    viewerUrl.navigate("b");
    viewerUrl.close();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledTimes(1); // the navigate
  });

  it("close without a push replaces with the param stripped", () => {
    const { history, state, viewerUrl } = fake("/home?pearl=a&settings=usage");
    viewerUrl.open("a");
    viewerUrl.close();
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith("/home?settings=usage");
    expect(state.href).toBe("/home?settings=usage");
  });

  it("close after navigating away replaces instead of going back", () => {
    const { history, state, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    state.href = "/folders/x"; // the page moved on
    viewerUrl.close();
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled(); // nothing to strip
  });

  it("close when the entry no longer carries the pushed pearl replaces", () => {
    const { history, state, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    state.href = "/home?pearl=other";
    viewerUrl.close();
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith("/home");
  });

  it("a second close does not go back twice", () => {
    const { history, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    viewerUrl.close();
    viewerUrl.close();
    expect(history.back).toHaveBeenCalledTimes(1);
  });

  it("onPopState without the param closes the open store", () => {
    mediaViewer.register([link("a")]);
    mediaViewer.open("a");
    const { viewerUrl } = fake("/home");
    viewerUrl.onPopState("");
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
  });

  it("Back off the viewer closes through the viewer's own close, without going back", () => {
    mediaViewer.register([link("a"), link("b")]);
    const f = page("/home");
    mediaViewer.open("a");
    mediaViewer.next();
    const request = vi.fn();
    const unregister = mediaViewer.setCloseRequest(request);
    f.history.back();
    // Not closed yet: the viewer closes a few frames later, as with Esc.
    expect(request).toHaveBeenCalledTimes(1);
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
    mediaViewer.close();
    expect(f.history.back).toHaveBeenCalledTimes(1);
    expect(f.history.replaceState).toHaveBeenCalledTimes(1); // the move to b
    expect(f.state.href).toBe("/home");
    unregister();
    f.binder.dispose();
  });

  it("a pop onto another pearl closes at once, without the viewer's close", () => {
    mediaViewer.register([link("a"), link("b")]);
    mediaViewer.open("b");
    const request = vi.fn();
    const unregister = mediaViewer.setCloseRequest(request);
    const { viewerUrl } = fake("/home?pearl=a");
    viewerUrl.onPopState("?pearl=a");
    expect(request).not.toHaveBeenCalled();
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    unregister();
  });

  it("onPopState with a param leaves the store alone", () => {
    mediaViewer.register([link("x")]);
    mediaViewer.open("x");
    const { viewerUrl } = fake("/home?pearl=x");
    viewerUrl.onPopState("?pearl=x");
    expect(mediaViewer.getSnapshot().currentId).toBe("x");
  });

  it("a pop onto another pearl closes the open store", () => {
    mediaViewer.register([link("a"), link("b")]);
    mediaViewer.open("b");
    const { viewerUrl } = fake("/home?pearl=a");
    viewerUrl.onPopState("?pearl=a");
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
  });

  it("a hash-only pop keeps the push record", () => {
    const { history, state, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    viewerUrl.onPopState("?pearl=a"); // same pearl, only the hash moved
    state.href = "/home?pearl=a#top";
    viewerUrl.close();
    expect(history.back).toHaveBeenCalledTimes(1);
  });

  it("a remounted ViewerUrl still goes back for an entry the old one pushed", () => {
    const first = fake("/home");
    first.viewerUrl.open("a");
    const remounted = new ViewerUrl(first.history, () => first.state.href);
    remounted.close();
    expect(first.history.back).toHaveBeenCalledTimes(1);
  });

  it("strip removes the param with a replace", () => {
    const { history, state, viewerUrl } = fake("/home?pearl=a&settings=usage#x");
    viewerUrl.strip();
    expect(history.replaceState).toHaveBeenCalledWith("/home?settings=usage#x");
    expect(state.href).toBe("/home?settings=usage#x");
  });
});

describe("bindViewerUrl", () => {
  it("drives open, two navigates and Esc end to end: one back, URL clean", () => {
    const { binder, history, state } = page("/home?settings=usage");
    mediaViewer.open("a");
    expect(history.pushState).toHaveBeenCalledTimes(1);
    mediaViewer.next();
    mediaViewer.next();
    expect(history.replaceState).toHaveBeenCalledTimes(2);
    expect(state.href).toBe("/home?settings=usage&pearl=c");
    mediaViewer.close(); // Esc
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(state.href).toBe("/home?settings=usage");
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    binder.dispose();
  });

  it("opens the pearl the URL names, without pushing a second entry", () => {
    const { binder, history, state } = page("/home?pearl=b");
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
    expect(history.pushState).not.toHaveBeenCalled();
    mediaViewer.close();
    expect(history.back).not.toHaveBeenCalled();
    expect(state.href).toBe("/home");
    binder.dispose();
  });

  it("keeps an unknown pearl pending until the page registers it", () => {
    const { binder, history, pending } = page("/home?pearl=z");
    expect(binder.pendingId()).toBe("z");
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    mediaViewer.register(["a", "z"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("z");
    expect(binder.pendingId()).toBeNull();
    expect(history.pushState).not.toHaveBeenCalled();
    expect(pending).toEqual(["z", null]);
    binder.dispose();
  });

  it("dismissPending clears the pending id and the param, and stays closed", () => {
    const { binder, state } = page("/home?pearl=z&settings=usage");
    binder.dismissPending();
    expect(binder.pendingId()).toBeNull();
    expect(state.href).toBe("/home?settings=usage");
    mediaViewer.register(["a", "z"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    binder.dispose();
  });

  it("dismissPending with nothing pending leaves the URL alone", () => {
    const { binder, history } = page("/home");
    binder.dismissPending();
    expect(history.replaceState).not.toHaveBeenCalled();
    binder.dispose();
  });

  it("Back from an open viewer closes it without another back", () => {
    const { binder, history, state } = page("/home");
    mediaViewer.open("a");
    history.back(); // the browser's Back
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(state.href).toBe("/home");
    binder.dispose();
  });

  it("Forward onto a pearl entry reopens it without pushing", () => {
    const { binder, history, forward } = page("/home");
    mediaViewer.open("a");
    history.back();
    forward();
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
    expect(history.pushState).toHaveBeenCalledTimes(1);
    binder.dispose();
  });

  it("Back onto a different registered pearl shows that pearl", () => {
    // /home?pearl=x never resolved; opening y from a card pushed a new entry.
    const { binder, history, state } = page("/home?pearl=x", ["a", "y"]);
    expect(binder.pendingId()).toBe("x");
    mediaViewer.open("y");
    expect(state.entries).toEqual(["/home?pearl=x", "/home?pearl=y"]);
    mediaViewer.register(["a", "x", "y"].map(link)); // x arrives meanwhile
    history.back();
    expect(mediaViewer.getSnapshot().currentId).toBe("x");
    expect(state.href).toBe("/home?pearl=x");
    binder.dispose();
  });

  it("Back onto a different unregistered pearl leaves it pending", () => {
    const { binder, history, state } = page("/home?pearl=x", ["a", "y"]);
    mediaViewer.open("y");
    history.back();
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    expect(binder.pendingId()).toBe("x");
    expect(state.href).toBe("/home?pearl=x");
    binder.dispose();
  });

  it("a pearl the list doesn't have stays pending; appended, it opens standalone", () => {
    const { binder, history, state, pending } = page("/home?pearl=z");
    expect(binder.pendingId()).toBe("z");
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    // The page fetched it on its own and appends it to what it registered.
    mediaViewer.register([...mediaViewer.getSnapshot().items, link("z")]);
    mediaViewer.open("z", { standalone: true });
    const snapshot = mediaViewer.getSnapshot();
    expect(snapshot.currentId).toBe("z");
    expect(snapshot.standalone).toBe(true);
    expect(binder.pendingId()).toBeNull();
    expect(pending).toEqual(["z", null]);
    // No neighbours: moving goes nowhere, and the URL is left as it was.
    mediaViewer.prev();
    expect(mediaViewer.getSnapshot().currentId).toBe("z");
    expect(history.pushState).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(state.href).toBe("/home?pearl=z");
    binder.dispose();
  });

  it("dismissPending(id) gives up only on that pearl", () => {
    const { binder, state } = page("/home?pearl=z");
    binder.dismissPending("other");
    expect(binder.pendingId()).toBe("z");
    expect(state.href).toBe("/home?pearl=z");
    binder.dismissPending("z");
    expect(binder.pendingId()).toBeNull();
    expect(state.href).toBe("/home");
    binder.dispose();
  });

  it("an empty registration while a pearl is pending keeps it and the URL", () => {
    const { binder, history, state } = page("/home?pearl=b", []);
    expect(binder.pendingId()).toBe("b");
    mediaViewer.register([]);
    expect(binder.pendingId()).toBe("b");
    mediaViewer.register(["a", "b", "c"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(history.pushState).not.toHaveBeenCalled();
    expect(state.href).toBe("/home?pearl=b");
    binder.dispose();
  });

  it("StrictMode's remount (register, unregisterPage, dispose, rebind) still opens the URL's pearl", () => {
    // Mount: the binder binds, then the page registers its pearls, which
    // opens the one the URL names.
    const first = page("/home?pearl=b", []);
    mediaViewer.register(["a", "b", "c"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
    // The simulated unmount, in the worse order (the page's cleanup before
    // the binder's): leaving the page isn't a close, so the URL stays.
    mediaViewer.unregisterPage();
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    expect(first.binder.pendingId()).toBe("b");
    expect(first.state.href).toBe("/home?pearl=b");
    first.binder.dispose();
    // The remount.
    const second = track(
      bindViewerUrl(
        mediaViewer,
        new ViewerUrl(first.history, () => first.state.href),
        first.getSearch,
      ),
    );
    mediaViewer.register(["a", "b", "c"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
    expect(first.state.href).toBe("/home?pearl=b");
    expect(first.history.replaceState).not.toHaveBeenCalled();
    expect(first.history.pushState).not.toHaveBeenCalled();
    expect(first.history.back).not.toHaveBeenCalled();
    second.dispose();
  });

  it("a remount while open from a card keeps the entry it pushed, and Esc goes back once", () => {
    const first = page("/home");
    mediaViewer.open("a");
    expect(first.history.pushState).toHaveBeenCalledTimes(1);
    mediaViewer.unregisterPage();
    expect(first.history.back).not.toHaveBeenCalled();
    expect(first.state.href).toBe("/home?pearl=a");
    first.binder.dispose();
    const second = track(
      bindViewerUrl(
        mediaViewer,
        new ViewerUrl(first.history, () => first.state.href),
        first.getSearch,
      ),
    );
    mediaViewer.register(["a", "b", "c"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
    expect(first.history.pushState).toHaveBeenCalledTimes(1);
    mediaViewer.close();
    expect(first.history.back).toHaveBeenCalledTimes(1);
    expect(first.state.href).toBe("/home");
    second.dispose();
  });

  it("request, unregisterPage, register: the pending pearl still opens, with its param", () => {
    const { binder, history, state } = page("/home?pearl=b", []);
    mediaViewer.unregisterPage();
    expect(binder.pendingId()).toBe("b");
    mediaViewer.register(["a", "b", "c"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("b");
    expect(mediaViewer.getSnapshot().pageLeft).toBe(false);
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(history.pushState).not.toHaveBeenCalled();
    expect(state.href).toBe("/home?pearl=b");
    binder.dispose();
  });

  it("a live list losing its last pearl closes the viewer: back, no reopen, nothing pending", () => {
    const { binder, history, state, pending } = page("/home");
    mediaViewer.open("a");
    expect(state.href).toBe("/home?pearl=a");
    mediaViewer.register([]); // the last pearls left (deleted elsewhere, a search)
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(state.href).toBe("/home");
    expect(binder.pendingId()).toBeNull();
    expect(pending).toEqual([]);
    // It coming back doesn't reopen anything.
    mediaViewer.register(["a"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    binder.dispose();
  });

  it("a live list losing its last pearl, opened from the URL, strips the param", () => {
    const { binder, history, state } = page("/home?pearl=a&ref=mail");
    expect(mediaViewer.getSnapshot().currentId).toBe("a");
    mediaViewer.register([]);
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    expect(history.back).not.toHaveBeenCalled();
    expect(state.href).toBe("/home?ref=mail");
    expect(binder.pendingId()).toBeNull();
    binder.dispose();
  });

  it("a live list dropping the shown pearl but keeping others moves to a neighbour", () => {
    const { binder, history, state } = page("/home");
    mediaViewer.open("b");
    mediaViewer.register(["a", "c"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBe("c");
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(history.back).not.toHaveBeenCalled();
    expect(state.href).toBe("/home?pearl=c"); // replaced in place
    expect(binder.pendingId()).toBeNull();
    binder.dispose();
  });

  it("pearls replaced by others still close the viewer and clean the URL", () => {
    const { binder, history, state } = page("/home");
    mediaViewer.open("a");
    mediaViewer.register(["x", "y"].map(link));
    expect(mediaViewer.getSnapshot().currentId).toBeNull();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(state.href).toBe("/home");
    expect(binder.pendingId()).toBeNull();
    binder.dispose();
  });

  it("an empty registration after the page moved on is a plain close", () => {
    const { binder, history, state } = page("/home");
    mediaViewer.open("a");
    state.href = "/folders/x"; // navigated away; then the old page unmounts
    mediaViewer.register([]);
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(binder.pendingId()).toBeNull();
    binder.dispose();
  });

  it("a remount while open still goes back on Esc", () => {
    const first = page("/home");
    mediaViewer.open("a");
    first.binder.dispose();
    const second = bindViewerUrl(
      mediaViewer,
      new ViewerUrl(first.history, () => first.state.href),
      first.getSearch,
    );
    mediaViewer.close();
    expect(first.history.back).toHaveBeenCalledTimes(1);
    second.dispose();
  });
});
