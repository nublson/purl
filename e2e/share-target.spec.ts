import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The Web Share Target: another app's share is a multipart POST to /share
// (public/manifest.json's share_target), answered by the service worker in
// an installed app or, as here (the worker is off in dev), by the /share
// route; either lands on Home with the URLs as `share` params, which Home
// saves through its paste flow. The save fetches https://example.com, so it
// needs network access. Files travel only through the worker's stash, which
// the unit tests cover (src/lib/share-target.test.ts).

const rows = (page: Page) => page.locator('[data-cy="link-item"]');

/** Submits the share form from the page, the way the OS share sheet does. */
async function share(page: Page, fields: Record<string, string>) {
  await page.evaluate((fields) => {
    const form = document.createElement("form");
    form.method = "post";
    form.enctype = "multipart/form-data";
    form.action = "/share";
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  }, fields);
}

test("a shared link lands on Home and is saved", async ({ page }) => {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');

  await share(page, { title: "Example Domain", url: "https://example.com" });

  await expect(page).toHaveURL(/\/home\?share=/);
  await expect(rows(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(rows(page)).toContainText("example.com");
  // Read once, then dropped: a reload must not save it again.
  await expect(page).toHaveURL(/\/home$/);
});

test("a shared text with a link in it saves that link", async ({ page }) => {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');

  await share(page, { text: "Look at this: https://example.org/. Nice." });

  await expect(rows(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(rows(page)).toContainText("example.org");
});

test("a share with nothing to save says so", async ({ page }) => {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');

  await share(page, { text: "just some words" });

  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Nothing to save" }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/);
});

test("shared files that never reached the page are reported", async ({ page }) => {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');

  // What the route answers for a share holding files (which it can't keep):
  // the page looks in the stash and finds nothing.
  await page.goto("/home?share=files");

  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Couldn't receive the shared files" }),
  ).toBeVisible();
});

test.describe("signed out", () => {
  test.use({ signedIn: false });

  test("a share lands on the landing page", async ({ page }) => {
    const response = await page.request.post("/share", {
      multipart: { url: "https://example.com" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(new URL(response.headers().location).pathname).toBe("/");
  });
});
