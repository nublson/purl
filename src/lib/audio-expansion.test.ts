import { describe, expect, it, vi } from "vitest";
import { createAudioExpansion } from "./audio-expansion";

describe("audioExpansion", () => {
  it("opens on toggle and closes on a second toggle", () => {
    const store = createAudioExpansion();
    expect(store.getSnapshot()).toBe(null);
    store.toggle("a");
    expect(store.getSnapshot()).toBe("a");
    store.toggle("a");
    expect(store.getSnapshot()).toBe(null);
  });

  it("toggling another pearl opens it and closes the first: one at a time", () => {
    const store = createAudioExpansion();
    store.toggle("a");
    store.toggle("b");
    expect(store.getSnapshot()).toBe("b");
  });

  it("close() clears whichever is open; close(id) only that one", () => {
    const store = createAudioExpansion();
    store.toggle("a");
    store.close("b");
    expect(store.getSnapshot()).toBe("a");
    store.close("a");
    expect(store.getSnapshot()).toBe(null);
    store.toggle("b");
    store.close();
    expect(store.getSnapshot()).toBe(null);
  });

  it("notifies subscribers once per change, and not for a no-op", () => {
    const store = createAudioExpansion();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.toggle("a");
    expect(listener).toHaveBeenCalledTimes(1);
    store.toggle("b");
    expect(listener).toHaveBeenCalledTimes(2);
    store.close("a");
    expect(listener).toHaveBeenCalledTimes(2);
    store.close();
    expect(listener).toHaveBeenCalledTimes(3);
    store.close();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    store.toggle("a");
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
