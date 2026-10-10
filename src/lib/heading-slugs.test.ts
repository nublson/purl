import { describe, expect, it } from "vitest";
import { createSlugger, slugify } from "./heading-slugs";

describe("slugify", () => {
  it("makes lowercase hyphenated slugs", () => {
    expect(slugify("Save a link")).toBe("save-a-link");
  });

  it("strips accents and punctuation", () => {
    expect(slugify("Créer & partager!")).toBe("creer-partager");
  });

  it("falls back to section when nothing is left", () => {
    expect(slugify("  ")).toBe("section");
  });
});

describe("createSlugger", () => {
  it("numbers repeats", () => {
    const slug = createSlugger();
    expect(["Request", "Response", "Request", "request"].map(slug)).toEqual([
      "request",
      "response",
      "request-2",
      "request-3",
    ]);
  });
});
