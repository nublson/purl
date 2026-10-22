import { afterEach, describe, expect, it } from "vitest";
import { ADD_LINKS_SHORTCUT, addLinksPopover } from "./add-links-popover";

describe("addLinksPopover store", () => {
  afterEach(() => {
    addLinksPopover.close();
  });

  it("exposes the keyboard shortcut", () => {
    expect(ADD_LINKS_SHORTCUT).toBe("A");
  });

  it("starts closed", () => {
    expect(addLinksPopover.current()).toBeNull();
  });

  it("opens on an anchor and closes", () => {
    addLinksPopover.open("header");
    expect(addLinksPopover.current()).toBe("header");
    addLinksPopover.close();
    expect(addLinksPopover.current()).toBeNull();
  });

  it("switches anchors when a different one opens", () => {
    addLinksPopover.open("header");
    addLinksPopover.open("empty");
    expect(addLinksPopover.current()).toBe("empty");
  });

  it("ignores opening the same anchor twice", () => {
    addLinksPopover.open("header");
    addLinksPopover.open("header");
    expect(addLinksPopover.current()).toBe("header");
  });

  it("treats close as a no-op when already closed", () => {
    addLinksPopover.close();
    expect(addLinksPopover.current()).toBeNull();
  });
});
