import { describe, expect, it, vi } from "vitest";
import { LANDING_SEEN_ATTR, LANDING_SEEN_KEY, LANDING_SEEN_SCRIPT, hasSeenLanding, markLandingSeen } from "./landing-intro";

describe("landing-intro", () => {
  describe("hasSeenLanding", () => {
    it("returns true when storage.getItem returns a truthy value", () => {
      const storage = { getItem: vi.fn(() => "1") };
      expect(hasSeenLanding(storage)).toBe(true);
    });

    it("returns false when storage.getItem returns null", () => {
      const storage = { getItem: vi.fn(() => null) };
      expect(hasSeenLanding(storage)).toBe(false);
    });

    it("returns false when storage is null", () => {
      expect(hasSeenLanding(null)).toBe(false);
    });

    it("returns false when storage is undefined", () => {
      expect(hasSeenLanding(undefined)).toBe(false);
    });

    it("returns false when storage.getItem throws", () => {
      const storage = { getItem: vi.fn(() => { throw new Error("denied"); }) };
      expect(hasSeenLanding(storage)).toBe(false);
    });
  });

  describe("markLandingSeen", () => {
    it("calls setItem with LANDING_SEEN_KEY and '1'", () => {
      const setItemMock = vi.fn();
      const storage = { setItem: setItemMock };
      markLandingSeen(storage);
      expect(setItemMock).toHaveBeenCalledWith(LANDING_SEEN_KEY, "1");
    });

    it("does not throw when storage is null", () => {
      expect(() => markLandingSeen(null)).not.toThrow();
    });

    it("does not throw when storage is undefined", () => {
      expect(() => markLandingSeen(undefined)).not.toThrow();
    });

    it("does not throw when setItem throws", () => {
      const storage = { setItem: vi.fn(() => { throw new Error("denied"); }) };
      expect(() => markLandingSeen(storage)).not.toThrow();
    });
  });

  describe("LANDING_SEEN_SCRIPT", () => {
    it("sets data-landing-seen on documentElement when localStorage has the key", () => {
      const setAttributeMock = vi.fn();
      const fakeDocument = { documentElement: { setAttribute: setAttributeMock } };
      const fakeLocalStorage = { getItem: vi.fn(() => "1") };

      const scriptFn = new Function("document", "localStorage", LANDING_SEEN_SCRIPT);
      scriptFn(fakeDocument, fakeLocalStorage);

      expect(setAttributeMock).toHaveBeenCalledWith(LANDING_SEEN_ATTR, "true");
    });

    it("does not set data-landing-seen when localStorage.getItem returns null", () => {
      const setAttributeMock = vi.fn();
      const fakeDocument = { documentElement: { setAttribute: setAttributeMock } };
      const fakeLocalStorage = { getItem: vi.fn(() => null) };

      const scriptFn = new Function("document", "localStorage", LANDING_SEEN_SCRIPT);
      scriptFn(fakeDocument, fakeLocalStorage);

      expect(setAttributeMock).not.toHaveBeenCalled();
    });

    it("does not throw when localStorage.getItem throws", () => {
      const setAttributeMock = vi.fn();
      const fakeDocument = { documentElement: { setAttribute: setAttributeMock } };
      const fakeLocalStorage = { getItem: vi.fn(() => { throw new Error("denied"); }) };

      const scriptFn = new Function("document", "localStorage", LANDING_SEEN_SCRIPT);
      expect(() => scriptFn(fakeDocument, fakeLocalStorage)).not.toThrow();
    });
  });

  describe("exports", () => {
    it("has correct constant values", () => {
      expect(LANDING_SEEN_KEY).toBe("purl:landing-seen");
      expect(LANDING_SEEN_ATTR).toBe("data-landing-seen");
    });
  });
});
