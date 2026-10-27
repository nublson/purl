import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Link } from "@/utils/links";
import { mediaViewer } from "./media-viewer";
import {
  ViewerUrl,
  pearlParam,
  withPearl,
  withoutPearl,
  type HistoryLike,
} from "./media-viewer-url";

function link(id: string): Link {
  return { id, contentType: "IMAGE", embed: null, title: id } as unknown as Link;
}

/** A fake history over a mutable href, like the browser's. */
function fake(initial: string) {
  const state = { href: initial };
  const history = {
    pushState: vi.fn((url: string) => {
      state.href = url;
    }),
    replaceState: vi.fn((url: string) => {
      state.href = url;
    }),
    back: vi.fn(),
  } satisfies HistoryLike;
  const viewerUrl = new ViewerUrl(history, () => state.href);
  return { state, history, viewerUrl };
}

beforeEach(() => {
  mediaViewer.close();
  mediaViewer.register([]);
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

  it("onPopState with a param leaves the store alone", () => {
    mediaViewer.register([link("x")]);
    mediaViewer.open("x");
    const { viewerUrl } = fake("/home?pearl=x");
    viewerUrl.onPopState("?pearl=x");
    expect(mediaViewer.getSnapshot().currentId).toBe("x");
  });

  it("closing the store from a pop does not go back again", () => {
    mediaViewer.register([link("a")]);
    mediaViewer.open("a");
    const { history, viewerUrl } = fake("/home");
    viewerUrl.open("a");
    const unsubscribe = mediaViewer.subscribe(() => {
      if (mediaViewer.getSnapshot().currentId === null) viewerUrl.close();
    });
    viewerUrl.onPopState("");
    unsubscribe();
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
