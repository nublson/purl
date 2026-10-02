import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Coming back to the app after RETURN_REFRESH_AFTER_MS (30s) away reloads
// the list and the folder counts. The page clock is faked so the test
// doesn't wait 30 real seconds.

const linkItems = (page: Page) => page.locator('[data-cy="link-item"]');

/** Fakes the tab being hidden or shown and fires `visibilitychange`. */
async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function openHome(page: Page) {
  await page.clock.install();
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"]');
  // The first visit may reload once to store the browser's time zone.
  await page.waitForLoadState("networkidle");
}

test.describe("Refresh on return", () => {
  test("coming back after 30s reloads the links and folder counts", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "First link" });
    await openHome(page);
    await expect(linkItems(page)).toHaveCount(1);

    await setVisibility(page, "hidden");
    await page.clock.fastForward(31_000);
    // Saved straight to the database: no realtime broadcast reaches the page.
    await seed.link({ url: "https://b.example", title: "Second link" });

    const links = page.waitForRequest((r) => r.url().includes("/api/links?"));
    const folders = page.waitForRequest((r) => r.url().endsWith("/api/folders"));
    await setVisibility(page, "visible");
    await Promise.all([links, folders]);
    await expect(linkItems(page)).toHaveCount(2);
  });

  test("a quick switch away and back doesn't reload", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "First link" });
    await openHome(page);

    let reloads = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/links?")) reloads++;
    });
    await setVisibility(page, "hidden");
    await page.clock.fastForward(5_000);
    await setVisibility(page, "visible");
    await page.waitForTimeout(500);
    expect(reloads).toBe(0);
  });
});
