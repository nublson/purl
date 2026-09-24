import { describe, expect, it } from "vitest";
import { parseLinksOrigin } from "./realtime-constants";

describe("parseLinksOrigin", () => {
  it("accepts UUID-like ids", () => {
    expect(parseLinksOrigin("6f1c2b1e-9a2d-4c3b-8e1f-0a1b2c3d4e5f")).toBe(
      "6f1c2b1e-9a2d-4c3b-8e1f-0a1b2c3d4e5f",
    );
  });

  it("rejects missing, oversized, or malformed values", () => {
    expect(parseLinksOrigin(null)).toBeNull();
    expect(parseLinksOrigin("")).toBeNull();
    expect(parseLinksOrigin("a".repeat(65))).toBeNull();
    expect(parseLinksOrigin("<script>")).toBeNull();
  });
});
