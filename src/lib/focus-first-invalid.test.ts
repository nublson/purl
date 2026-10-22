import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusFirstInvalid } from "./focus-first-invalid";

describe("focusFirstInvalid", () => {
  const raf = vi.fn<(cb: FrameRequestCallback) => number>();

  beforeEach(() => {
    raf.mockReset();
    vi.stubGlobal("requestAnimationFrame", raf);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing without a form", () => {
    focusFirstInvalid(null);
    expect(raf).not.toHaveBeenCalled();
  });

  it("focuses the first aria-invalid field on the next frame", () => {
    const field = { focus: vi.fn() };
    const form = {
      querySelector: vi.fn(() => field),
    } as unknown as HTMLFormElement;

    raf.mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    focusFirstInvalid(form);
    expect(form.querySelector).toHaveBeenCalledWith('[aria-invalid="true"]');
    expect(field.focus).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no invalid field is found", () => {
    const form = {
      querySelector: vi.fn(() => null),
    } as unknown as HTMLFormElement;

    raf.mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    focusFirstInvalid(form);
    expect(form.querySelector).toHaveBeenCalled();
  });
});
