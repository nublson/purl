import { afterEach, describe, expect, it, vi } from "vitest";
import { activeEmbed } from "./active-embed";

afterEach(() => activeEmbed.set(null));

describe("activeEmbed", () => {
  it("starts with no active card", () => {
    expect(activeEmbed.get()).toBeNull();
  });

  it("holds one card at a time: setting a second replaces the first", () => {
    activeEmbed.set("a");
    activeEmbed.set("b");
    expect(activeEmbed.get()).toBe("b");
  });

  it("clearIf clears only that card", () => {
    activeEmbed.set("a");
    activeEmbed.clearIf("b");
    expect(activeEmbed.get()).toBe("a");
    activeEmbed.clearIf("a");
    expect(activeEmbed.get()).toBeNull();
  });

  it("tells listeners when the active card changes, and not otherwise", () => {
    const listener = vi.fn();
    const stop = activeEmbed.subscribe(listener);
    activeEmbed.set("a");
    activeEmbed.set("a");
    activeEmbed.clearIf("b");
    expect(listener).toHaveBeenCalledTimes(1);
    activeEmbed.clearIf("a");
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    activeEmbed.set("c");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
