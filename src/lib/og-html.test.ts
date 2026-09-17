import { describe, expect, it } from "vitest";
import {
  OG_HTML_READ_MAX_BYTES,
  readHtmlForOpenGraph,
  truncateHtmlAtHead,
} from "./og-html";

describe("truncateHtmlAtHead", () => {
  it("cuts at the closing head tag regardless of case", () => {
    const html =
      "<html><HEAD><meta property=\"og:title\" content=\"T\"/></HEAD><body>" +
      "x".repeat(10_000) +
      "</body></html>";
    const truncated = truncateHtmlAtHead(html);
    expect(truncated.toLowerCase().endsWith("</head>")).toBe(true);
    expect(truncated).not.toContain("xxxxx");
    expect(truncated).toContain('property="og:title"');
  });

  it("returns the full string when </head> is missing", () => {
    expect(truncateHtmlAtHead("<html><body>hi</body></html>")).toBe(
      "<html><body>hi</body></html>",
    );
  });
});

describe("readHtmlForOpenGraph", () => {
  it("stops after </head> without retaining the body", async () => {
    const body = "B".repeat(200_000);
    const html = `<html><head><title>Hi</title></head><body>${body}</body></html>`;
    const res = new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const out = await readHtmlForOpenGraph(res);
    expect(out).toBe("<html><head><title>Hi</title></head>");
    expect(out).not.toContain("BBB");
  });

  it("respects the max-bytes cap when </head> never appears", async () => {
    const html = "Z".repeat(OG_HTML_READ_MAX_BYTES + 50_000);
    const res = new Response(html, { status: 200 });
    const out = await readHtmlForOpenGraph(res, 8_000);
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(8_000);
  });

  it("falls back to response.text() when the body stream is unavailable", async () => {
    const body = "Y".repeat(50_000);
    const html = `<html><head><title>Fallback</title></head><body>${body}</body></html>`;
    const res = new Response(html, { status: 200 });
    Object.defineProperty(res, "body", { value: null });

    const out = await readHtmlForOpenGraph(res);
    expect(out).toBe("<html><head><title>Fallback</title></head>");
    expect(out).not.toContain("YYYY");
  });
});
