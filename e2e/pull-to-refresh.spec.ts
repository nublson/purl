import type { CDPSession, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Real touch input needs the Chrome DevTools Protocol, so this runs in
// Chromium only; WebKit gets the same component through the shared code.
test.skip(({ browserName }) => browserName !== "chromium", "touch via CDP");
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const linkItems = (page: Page) => page.locator('[data-cy="link-item"]');

/** Drags one finger from (x, y) down by `dy` px in small steps, optionally holding before release. */
async function pull(
  cdp: CDPSession,
  { x, y, dy, beforeRelease }: { x: number; y: number; dy: number; beforeRelease?: () => Promise<void> },
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + (dy * i) / steps }],
    });
  }
  await beforeRelease?.();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("Pull to refresh", () => {
  test("pulling past the threshold reloads the list in place", async ({ page, seed }, testInfo) => {
    await seed.link({ url: "https://a.example", title: "First link" });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await expect(linkItems(page)).toHaveCount(1);
    // The browser's own pull-to-refresh is off while ours is on the page.
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
    ).toBe("none");
    // The first visit may reload once to store the browser's time zone.
    await page.waitForLoadState("networkidle");

    // Saved straight to the database: no realtime broadcast reaches the page.
    await seed.link({ url: "https://b.example", title: "Second link" });
    await page.waitForTimeout(300);
    await expect(linkItems(page)).toHaveCount(1);

    const cdp = await page.context().newCDPSession(page);
    const reload = page.waitForRequest(
      (request) => request.url().includes("/api/links?") && request.method() === "GET",
    );
    await pull(cdp, {
      x: 195,
      y: 220,
      dy: 200,
      beforeRelease: async () => {
        const path = testInfo.outputPath("mid-pull.png");
        await page.screenshot({ path });
        await testInfo.attach("mid-pull", { path, contentType: "image/png" });
      },
    });
    await reload;
    await expect(page.getByRole("status").filter({ hasText: "Refreshing links" })).toBeAttached();
    await expect(linkItems(page)).toHaveCount(2);
    await expect(page.getByRole("status").filter({ hasText: "Links refreshed" })).toBeAttached();
  });

  test("a short pull springs back without reloading", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "First link" });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');

    let reloads = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/links?")) reloads++;
    });
    const cdp = await page.context().newCDPSession(page);
    await pull(cdp, { x: 195, y: 220, dy: 60 });
    await page.waitForTimeout(500);
    expect(reloads).toBe(0);
  });
});
