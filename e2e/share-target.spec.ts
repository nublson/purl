import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The Web Share Target: another app's share is a multipart POST to /share
// (public/manifest.json's share_target), answered by the service worker in
// an installed app or, as here (the worker is off in dev), by the /share
// route; either lands on Home flagged `?share=1` and hands the share over
// same-origin (the worker's stash, or here the route's cookie), never in
// the URL; Home saves the links through its paste flow. The save fetches https://example.com, so it needs
// network access. Files travel only through the worker's stash, which the
// unit tests cover (src/lib/share-target.test.ts).

const rows = (page: Page) => page.locator('[data-cy="link-item"]');

/**
 * Submits the share form from the page, the way the OS share sheet does;
 * `file` adds a one-pixel PNG as `files`.
 */
async function share(
  page: Page,
  fields: Record<string, string>,
  { file = false }: { file?: boolean } = {},
) {
  await page.evaluate(
    ({ fields, file }) => {
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
      if (file) {
        const input = document.createElement("input");
        input.type = "file";
        input.name = "files";
        const transfer = new DataTransfer();
        transfer.items.add(new File(["png"], "pixel.png", { type: "image/png" }));
        input.files = transfer.files;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    },
    { fields, file },
  );
}

test("a shared link lands on Home and is saved", async ({ page }) => {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');

  await share(page, { title: "Example Domain", url: "https://example.com" });

  await expect(page).toHaveURL(/\/home\?share=1$/);
  await expect(rows(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(rows(page)).toContainText("example.com");
  // Taken once, then the flag dropped: a reload must not look again.
  await expect(page).toHaveURL(/\/home$/);
  await expect
    .poll(() => page.evaluate(() => document.cookie.includes("purl-share=")))
    .toBe(false);
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

  // Without the worker the route can't keep the file: it says how many
  // there were, and the page finds none in the stash.
  await share(page, { text: "" }, { file: true });

  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Couldn't receive the shared files" }),
  ).toBeVisible();
  await expect(page.locator('[data-cy="pending-upload"]')).toHaveCount(0);
});

test("the links never travel in the URL", async ({ page }) => {
  // What a website could send a signed-in user to: the flag alone, or a
  // link in the query, saves nothing.
  for (const path of ["/home?share=1", "/home?share=https%3A%2F%2Fexample.com"]) {
    await page.goto(path);
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Couldn't receive what was shared" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
  }
  await expect(rows(page)).toHaveCount(0);
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
