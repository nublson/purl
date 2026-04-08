import { describe, expect, it } from "vitest";
import { buildMetadataText } from "./metadata-chunk";

describe("buildMetadataText", () => {
  it("includes title, type, domain, URL, and description when present", () => {
    const text = buildMetadataText({
      title: "My Video",
      url: "https://youtube.com/watch?v=abc",
      domain: "youtube.com",
      contentType: "YOUTUBE",
      description: "Author Name",
    });
    expect(text).toContain("Title: My Video");
    expect(text).toContain("Type: YouTube video");
    expect(text).toContain("Domain: youtube.com");
    expect(text).toContain("URL: https://youtube.com/watch?v=abc");
    expect(text).toContain("Description: Author Name");
  });

  it("maps WEB, PDF, and AUDIO content types to readable labels", () => {
    expect(
      buildMetadataText({
        title: "Page",
        url: "https://a.com",
        domain: "a.com",
        contentType: "WEB",
        description: null,
      }),
    ).toContain("Type: Web page");

    expect(
      buildMetadataText({
        title: "Doc",
        url: "https://a.com/x.pdf",
        domain: "a.com",
        contentType: "PDF",
        description: null,
      }),
    ).toContain("Type: PDF document");

    expect(
      buildMetadataText({
        title: "Pod",
        url: "https://a.com/x.mp3",
        domain: "a.com",
        contentType: "AUDIO",
        description: null,
      }),
    ).toContain("Type: Audio recording");
  });

  it("omits description line when null or blank", () => {
    const text = buildMetadataText({
      title: "T",
      url: "https://x.com",
      domain: "x.com",
      contentType: "WEB",
      description: null,
    });
    expect(text).not.toContain("Description:");
  });

  it("uses domain as title fallback when title is whitespace", () => {
    const text = buildMetadataText({
      title: "   ",
      url: "https://vite.dev",
      domain: "vite.dev",
      contentType: "WEB",
      description: null,
    });
    expect(text).toContain("Title: vite.dev");
  });
});
