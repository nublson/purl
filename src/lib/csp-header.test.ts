import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp-header";

describe("buildContentSecurityPolicy", () => {
  it("allows browser extension connect-src for credentialed API calls", () => {
    const policy = buildContentSecurityPolicy();
    expect(policy).toContain("connect-src");
    expect(policy).toContain("chrome-extension:");
  });
});
