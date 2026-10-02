import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

const header = (headers: { key: string; value: string }[], key: string) =>
  headers.find((h) => h.key === key)?.value;

describe("buildSecurityHeaders", () => {
  it("denies framing in production, alongside the CSP's frame-ancestors", () => {
    const headers = buildSecurityHeaders("production");
    expect(header(headers, "X-Frame-Options")).toBe("DENY");
    expect(header(headers, "Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  it("denies framing in development, where it's the only framing protection", () => {
    const headers = buildSecurityHeaders("development");
    expect(header(headers, "X-Frame-Options")).toBe("DENY");
    expect(header(headers, "Content-Security-Policy")).toBeUndefined();
  });

  it.each(["production", "development"])(
    "keeps the base headers in %s",
    (nodeEnv) => {
      const headers = buildSecurityHeaders(nodeEnv);
      expect(header(headers, "X-Content-Type-Options")).toBe("nosniff");
      expect(header(headers, "Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(header(headers, "Permissions-Policy")).toContain("camera=()");
    },
  );
});
