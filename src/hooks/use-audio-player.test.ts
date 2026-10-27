import { afterEach, describe, expect, it, vi } from "vitest";
import { audioPlayerStore } from "./use-audio-player";

describe("audioPlayerStore", () => {
  afterEach(() => {
    if (audioPlayerStore.getSnapshot() !== null) {
      audioPlayerStore.toggle(audioPlayerStore.getSnapshot() as string);
    }
  });

  it("plays one id at a time", () => {
    audioPlayerStore.toggle("a");
    expect(audioPlayerStore.getSnapshot()).toBe("a");
    audioPlayerStore.toggle("b");
    expect(audioPlayerStore.getSnapshot()).toBe("b");
    audioPlayerStore.toggle("b");
    expect(audioPlayerStore.getSnapshot()).toBeNull();
  });

  it("notifies subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = audioPlayerStore.subscribe(listener);
    audioPlayerStore.toggle("a");
    audioPlayerStore.toggle("b");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    audioPlayerStore.toggle("b");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
