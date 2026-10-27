import { describe, expect, it } from "vitest";
import { decideDrag } from "./viewer-drag";

const still = { x: 0, y: 0 };

describe("decideDrag", () => {
  it("a horizontal drag past 80px moves by its sign: left is next, right is previous", () => {
    expect(decideDrag({ x: -90, y: 0 }, still, "x")).toBe("next");
    expect(decideDrag({ x: 90, y: 0 }, still, "x")).toBe("prev");
  });

  it("a short horizontal flick past 400px/s moves too", () => {
    expect(decideDrag({ x: 50, y: 0 }, { x: 450, y: 0 }, "x")).toBe("prev");
    expect(decideDrag({ x: -50, y: 0 }, { x: -450, y: 0 }, "x")).toBe("next");
  });

  it("a vertical drag past 80px closes, up or down", () => {
    expect(decideDrag({ x: 0, y: 85 }, still, "y")).toBe("close");
    expect(decideDrag({ x: 0, y: -85 }, still, "y")).toBe("close");
    expect(decideDrag({ x: 0, y: 20 }, { x: 0, y: -500 }, "y")).toBe("close");
  });

  it("a short, slow drag does nothing", () => {
    expect(decideDrag({ x: 70, y: 0 }, { x: 100, y: 0 }, "x")).toBe("none");
    expect(decideDrag({ x: 0, y: 70 }, { x: 0, y: 100 }, "y")).toBe("none");
  });

  it("a drag flicked back against its way does nothing", () => {
    expect(decideDrag({ x: -90, y: 0 }, { x: 450, y: 0 }, "x")).toBe("none");
  });

  it("without a direction lock, nothing happens", () => {
    expect(decideDrag({ x: -200, y: 0 }, { x: -900, y: 0 }, null)).toBe("none");
    expect(decideDrag({ x: 0, y: 200 }, still, null)).toBe("none");
  });

  it("the locked axis decides: vertical movement on a horizontal lock never closes", () => {
    expect(decideDrag({ x: 10, y: 200 }, still, "x")).toBe("none");
    expect(decideDrag({ x: -200, y: 10 }, still, "y")).toBe("none");
  });
});
