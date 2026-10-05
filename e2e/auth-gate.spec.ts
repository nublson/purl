import { expect, test } from "./fixtures";

// The proxy only checks that a session cookie is there (an optimistic
// check, no database work); the pages and API routes check the session
// itself. A cookie that isn't a real session must get no further.

test.describe("Sign-in gate", () => {
  test.use({ signedIn: false });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "not-a-real-session.signature",
        url: baseURL!,
      },
    ]);
  });

  test("a stale or forged cookie lands on the landing page, without a loop", async ({ page }) => {
    for (const path of ["/home", "/folders/anything", "/oauth/consent?consent_code=x&client_id=y"]) {
      const response = await page.goto(path);
      expect(new URL(page.url()).pathname).toBe("/");
      expect(response?.ok()).toBe(true);
    }
  });

  test("API routes answer 401 to it", async ({ page }) => {
    for (const path of ["/api/links", "/api/folders", "/api/pdf-proxy?url=https%3A%2F%2Fexample.com%2Fa.pdf"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(401);
    }
  });
});

test("a real session still opens Home", async ({ page }) => {
  await page.goto("/home");
  expect(new URL(page.url()).pathname).toBe("/home");
});
