import { describe, expect, it } from "vitest";
import { derivePdfTitleFromUrl } from "./pdf-title";

describe("derivePdfTitleFromUrl", () => {
  it("derives a readable title from a PDF filename", () => {
    expect(
      derivePdfTitleFromUrl(
        "https://example.com/papers/react-server-components.pdf",
        "example.com",
      ),
    ).toBe("react server components");
  });

  it("decodes URL-encoded filenames and strips the extension", () => {
    expect(
      derivePdfTitleFromUrl(
        "https://example.com/files/My%20Report.pdf",
        "example.com",
      ),
    ).toBe("My Report");
  });

  it("replaces hyphens and underscores with spaces", () => {
    expect(
      derivePdfTitleFromUrl(
        "https://cdn.example.com/docs/annual-report_2025.pdf",
        "cdn.example.com",
      ),
    ).toBe("annual report 2025");
  });

  it("falls back to the domain when the path has no filename", () => {
    expect(
      derivePdfTitleFromUrl("https://example.com/", "example.com"),
    ).toBe("example.com");
  });

  it("falls back to the domain for invalid URLs", () => {
    expect(derivePdfTitleFromUrl("not-a-url", "fallback.com")).toBe(
      "fallback.com",
    );
  });

  it("falls back to the domain when the filename is only the extension", () => {
    expect(
      derivePdfTitleFromUrl("https://example.com/.pdf", "example.com"),
    ).toBe("example.com");
  });
});
