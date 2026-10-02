import type { APIResponse } from "@playwright/test";
import { expect, test } from "./fixtures";

// The running app (dev in these tests) must refuse to be framed on both
// pages and API responses; in dev, X-Frame-Options is the only framing
// protection because the CSP is production-only (src/lib/security-headers.ts).
function expectFramingDenied(response: APIResponse) {
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
}

test.describe("Security headers", () => {
  test.describe("signed out", () => {
    test.use({ signedIn: false });

    test("the landing page denies framing", async ({ page }) => {
      const response = await page.request.get("/");
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/html");
      expectFramingDenied(response);
    });
  });

  test("an API response denies framing", async ({ page }) => {
    // Signed in, so this is the route's own JSON, not the auth redirect.
    const response = await page.request.get("/api/links", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expectFramingDenied(response);
  });
});
