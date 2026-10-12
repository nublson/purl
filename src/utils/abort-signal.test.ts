import { describe, expect, it } from "vitest";
import { timeoutSignal } from "./abort-signal";

/** Resolves when `signal` aborts (it never does under fake timers, so tests here use short real ones). */
function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

describe("timeoutSignal", () => {
  it("aborts after the timeout", async () => {
    const signal = timeoutSignal(20);
    expect(signal.aborted).toBe(false);
    await aborted(signal);
    expect(signal.aborted).toBe(true);
  });

  it("aborts as soon as the outer signal does, before the timeout", () => {
    const outer = new AbortController();
    const signal = timeoutSignal(60_000, outer.signal);
    expect(signal.aborted).toBe(false);
    outer.abort();
    expect(signal.aborted).toBe(true);
  });

  it("still times out when the outer signal never aborts", async () => {
    const outer = new AbortController();
    const signal = timeoutSignal(20, outer.signal);
    await aborted(signal);
    expect(signal.aborted).toBe(true);
    expect(outer.signal.aborted).toBe(false);
  });

  it("is already aborted when the outer signal is", () => {
    const outer = new AbortController();
    outer.abort();
    expect(timeoutSignal(60_000, outer.signal).aborted).toBe(true);
  });
});
