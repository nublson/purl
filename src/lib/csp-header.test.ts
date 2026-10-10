import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp-header";

describe("buildContentSecurityPolicy", () => {
  it("allows browser extension connect-src for credentialed API calls", () => {
    const policy = buildContentSecurityPolicy();
    expect(policy).toContain("connect-src");
    expect(policy).toContain("chrome-extension:");
  });

  it("allows only vercel.live and YouTube (no-cookie) as frame sources", () => {
    const policy = buildContentSecurityPolicy();
    const frameSrc = policy
      .split("; ")
      .find((directive) => directive.startsWith("frame-src"));
    expect(frameSrc).toBe(
      "frame-src 'self' https://vercel.live https://*.vercel.live https://www.youtube-nocookie.com",
    );
  });
});
