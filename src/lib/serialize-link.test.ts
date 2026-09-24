import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeLink } from "./serialize-link";

// ─── helpers ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date("2025-09-01T12:00:00Z");

function makeLink(
  overrides: Partial<Parameters<typeof serializeLink>[0]> = {},
): Parameters<typeof serializeLink>[0] {
  return {
    id: "link-1",
    url: "https://example.com",
    title: "Example",
    description: null,
    favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    thumbnail: null,
    domain: "example.com",
    contentType: "WEB",
    createdAt: BASE_DATE,
    ...overrides,
  };
}

// ─── serializeLink ────────────────────────────────────────────────────────────

describe("serializeLink", () => {
  it("serializes createdAt to an ISO string", () => {
    const result = serializeLink(makeLink());
    expect(result.createdAt).toBe(BASE_DATE.toISOString());
  });

  it("preserves all scalar fields verbatim", () => {
    const link = makeLink({
      id: "abc",
      url: "https://test.dev",
      title: "Test Link",
      favicon: "https://test.dev/favicon.ico",
      domain: "test.dev",
    });

    const result = serializeLink(link);

    expect(result.id).toBe("abc");
    expect(result.url).toBe("https://test.dev");
    expect(result.title).toBe("Test Link");
    expect(result.favicon).toBe("https://test.dev/favicon.ico");
    expect(result.domain).toBe("test.dev");
    expect(result).not.toHaveProperty("ingestStatus");
  });

  it("defaults contentType to 'WEB' when the field is undefined", () => {
    const link = makeLink({ contentType: undefined });
    const result = serializeLink(link);
    expect(result.contentType).toBe("WEB");
  });

  it("preserves non-WEB contentType values", () => {
    for (const type of ["YOUTUBE", "PDF", "AUDIO"] as const) {
      const result = serializeLink(makeLink({ contentType: type }));
      expect(result.contentType).toBe(type);
    }
  });

  it("serializes nullable description correctly (null stays null)", () => {
    const result = serializeLink(makeLink({ description: null }));
    expect(result.description).toBeNull();
  });

  it("serializes a non-null description", () => {
    const result = serializeLink(makeLink({ description: "A brief desc" }));
    expect(result.description).toBe("A brief desc");
  });

  it("serializes nullable thumbnail correctly (null stays null)", () => {
    const result = serializeLink(makeLink({ thumbnail: null }));
    expect(result.thumbnail).toBeNull();
  });

  it("serializes a non-null thumbnail URL", () => {
    const result = serializeLink(
      makeLink({ thumbnail: "https://img.example.com/thumb.jpg" }),
    );
    expect(result.thumbnail).toBe("https://img.example.com/thumb.jpg");
  });

  it("returns a plain object (no Date instances) safe for JSON serialization", () => {
    const result = serializeLink(makeLink());
    // Ensure JSON.stringify/parse roundtrip is lossless for the date field
    const roundtripped = JSON.parse(JSON.stringify(result));
    expect(roundtripped.createdAt).toBe(BASE_DATE.toISOString());
  });
});

describe("serializeLink – uploaded files", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("turns the relative upload file route into an absolute app URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://purl.example.com/");
    const result = serializeLink(
      makeLink({ id: "abc", url: "/api/links/abc/file", contentType: "PDF" }),
    );
    expect(result.url).toBe("https://purl.example.com/api/links/abc/file");
  });

  it("leaves external URLs untouched", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://purl.example.com");
    const result = serializeLink(makeLink({ url: "https://example.com/doc.pdf" }));
    expect(result.url).toBe("https://example.com/doc.pdf");
  });
});
