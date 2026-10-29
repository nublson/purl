import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp-header";

describe("buildContentSecurityPolicy", () => {
  it("allows browser extension connect-src for credentialed API calls", () => {
    const policy = buildContentSecurityPolicy();
    expect(policy).toContain("connect-src");
    expect(policy).toContain("chrome-extension:");
  });

  it("allows any https host (live pearls) and vercel.live as frame sources", () => {
    const policy = buildContentSecurityPolicy();
    const frameSrc = policy
      .split("; ")
      .find((directive) => directive.startsWith("frame-src"));
    expect(frameSrc).toBe(
      "frame-src 'self' https: https://vercel.live https://*.vercel.live",
    );
  });

  it("lets video and audio play from any host and from local blob: previews", () => {
    const policy = buildContentSecurityPolicy();
    const mediaSrc = policy
      .split("; ")
      .find((directive) => directive.startsWith("media-src"));
    expect(mediaSrc).toBe("media-src 'self' blob: https: http:");
  });
});
