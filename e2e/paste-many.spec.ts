import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Pasting a list of links saves each one. These go through the real save path
// (POST /api/links → metadata fetch → insert), so they need network access to
// the IANA example domains.
const LIST = ["https://example.com", "https://example.org", "https://example.net"].join(
  "\n",
);

/** Four links, so a batch has two landings with rows already below them. */
const LIST4 = `${LIST}\nhttps://www.iana.org`;

const rows = (page: Page) => page.locator('[data-cy="link-item"]');

/** Dispatches a paste of `text` on `selector` (or the document), as the browser would. */
async function paste(page: Page, text: string, selector?: string) {
  await page.evaluate(
    ({ text, selector }) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      const target = selector ? document.querySelector(selector)! : document;
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { text, selector },
  );
}


type Glide = { key: string; dy: number };

/**
 * Records every FLIP glide (a `translate` animation on a `[data-flip]`
 * element): its key and which way it moved (`dy` < 0: down the page, since
 * FLIP starts from where the element was; > 0: up). The glides last 300ms,
 * too short to catch in the DOM.
 */
async function spyOnGlides(page: Page) {
  await page.addInitScript(() => {
    const log: { key: string; dy: number }[] = [];
    (window as unknown as { __glides: typeof log }).__glides = log;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const key = (this as HTMLElement).dataset?.flip;
      const first = Array.isArray(keyframes) ? keyframes[0] : null;
      const transform =
        first && typeof first.transform === "string" ? first.transform : "";
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform);
      if (key && match) log.push({ key, dy: Number(match[2]) });
      return original.call(this, keyframes, options);
    };
  });
}

const glides = (page: Page) =>
  page.evaluate(() => (window as unknown as { __glides: Glide[] }).__glides);

/** Slows each save, so a batch's steps can be seen. */
async function slowSaves(page: Page, ms = 700) {
  await page.route("**/api/links", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

test.describe("Pasting several links", () => {
  test("a list pasted on the page saves every link, with one toast", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');

    await paste(page, LIST);

    await expect(rows(page)).toHaveCount(3, { timeout: 45_000 });
    await expect(page.getByText("Saved 3 links", { exact: true })).toBeVisible();
    // Not one "Link saved" toast per link.
    await expect(page.getByText("Link saved", { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(rows(page)).toHaveCount(3);
  });

  test("a list in the search field gets a Save row each; + saves one, Enter the rest", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    const field = page.getByRole("searchbox", {
      name: "Search your links or paste a link to save",
    });
    const saveRows = page.locator('[data-cy="omnibox-save-row"]');

    // What a browser leaves in the field after pasting the list: one line.
    await field.fill(LIST.split("\n").join(" "));
    await expect(saveRows).toHaveCount(3);
    await expect(rows(page)).toHaveCount(0);

    // + on one saves just that link; the other two keep their rows.
    await saveRows.filter({ hasText: "example.com" }).click();
    await expect(saveRows).toHaveCount(2);
    await expect(field).toHaveValue("https://example.org https://example.net");

    // Enter saves what's left, in one batch, and empties the field.
    await field.press("Enter");
    await expect(field).toHaveValue("");
    await expect(rows(page)).toHaveCount(3, { timeout: 45_000 });
    await expect(page.getByText("Saved 2 links", { exact: true })).toBeVisible();
  });

  test("clearing the field after a list doesn't flash the empty state", async ({ page, seed }) => {
    await seed.link({ url: "https://saved.example", title: "Already here" });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    const field = page.getByRole("searchbox", {
      name: "Search your links or paste a link to save",
    });

    // The list's answer to the pasted text: nothing matches, Save rows stand in.
    const answered = page.waitForResponse(
      (response) =>
        response.url().includes("/api/links?") && response.url().includes("q="),
    );
    await field.fill("https://example.com https://example.org");
    await answered;
    await expect(page.locator('[data-cy="omnibox-save-row"]')).toHaveCount(2);
    // Let that answer settle on screen (the search skeleton, if any, is gone).
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(0);

    // Slow the whole list's reload, as on a cold start.
    await page.route("**/api/links?**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.getByRole("button", { name: "Clear search" }).click();

    // While it loads: never "no links match", and then the list.
    // (One-shot counts: `expect(...).toHaveCount(0)` would retry until the
    // text goes away, which it does once the list lands.)
    const empty = page.getByText(/No links match/);
    const skeleton = page.getByText("Searching links");
    for (const wait of [50, 650]) {
      await page.waitForTimeout(wait);
      expect(await empty.count()).toBe(0);
      // The rows left at once, so the skeleton is already in their place.
      expect(await skeleton.count()).toBe(1);
    }
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(1);
  });

  test("one indicator counts the batch, stays until the last link, and links land under it", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    // Slow each save down, so every step of the count can be seen.
    await page.route("**/api/links", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });

    await paste(page, LIST);

    const indicator = page.locator('[data-cy="bulk-save-indicator"]');
    await expect(indicator).toHaveCount(1);
    await expect(indicator).toContainText("1/3");
    await expect(indicator).toContainText("https://example.com");
    // The same element for the whole batch: it doesn't blink out between links.
    await indicator.evaluate((el) => el.setAttribute("data-probe", "same"));

    await expect(indicator).toContainText("2/3", { timeout: 15_000 });
    await expect(indicator).toContainText("https://example.org");
    // The first link is already in the list, under the indicator.
    await expect(rows(page)).toHaveCount(1);
    await expect(indicator).toHaveAttribute("data-probe", "same");

    await expect(indicator).toContainText("3/3", { timeout: 15_000 });
    await expect(indicator).toHaveAttribute("data-probe", "same");

    // Gone with the last link; the summary stays.
    await expect(indicator).toHaveCount(0, { timeout: 15_000 });
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByText("Saved 3 links", { exact: true })).toBeVisible();
  });

  test("the grid view shows the same single indicator as a card", async ({ page }) => {
    const set = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(set.ok()).toBe(true);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    await page.route("**/api/links", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });

    await paste(page, LIST);

    const indicator = page.locator('[data-cy="bulk-save-indicator"]');
    await expect(indicator).toHaveCount(1);
    await expect(indicator).toContainText("1/3");
    await expect(indicator).toContainText("https://example.com");
    await expect(indicator).toContainText("3/3", { timeout: 20_000 });
    await expect(indicator).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("Saved 3 links", { exact: true })).toBeVisible();
  });

  test("rows glide down as a batch's links land, and stay put when its last one takes the indicator's place", async ({ page }) => {
    await spyOnGlides(page);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    await slowSaves(page);

    await paste(page, LIST4);
    await expect(page.locator('[data-cy="bulk-save-indicator"]')).toHaveCount(0, {
      timeout: 40_000,
    });
    await expect(rows(page)).toHaveCount(4);

    const links = (await glides(page)).filter((g) => g.key.startsWith("link:"));
    // Links 2 and 3 each pushed the rows already there down a row (1 + 2)…
    expect(links.filter((g) => g.dy < -10)).toHaveLength(3);
    // …and the last link landed in the indicator's slot as it left: the rows
    // below don't drop a row and spring back.
    expect(links.filter((g) => g.dy > 10)).toHaveLength(0);
  });

  test("when the last link fails, the rows glide up into the indicator's place", async ({ page }) => {
    await spyOnGlides(page);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    await page.route("**/api/links", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (route.request().postData()?.includes("example.net")) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Boom" }),
        });
      }
      return route.continue();
    });

    await paste(page, LIST);
    await expect(page.getByText(/Saved 2 of 3 links/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-cy="bulk-save-indicator"]')).toHaveCount(0);

    const links = (await glides(page)).filter((g) => g.key.startsWith("link:"));
    // Link 2 pushed link 1 down; the indicator then left with nothing landing
    // in its place, so both rows glided up.
    expect(links.filter((g) => g.dy < -10)).toHaveLength(1);
    expect(links.filter((g) => g.dy > 10)).toHaveLength(2);
  });

  test("the grid glides too", async ({ page }) => {
    const set = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(set.ok()).toBe(true);
    await spyOnGlides(page);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    await slowSaves(page);

    await paste(page, LIST4);
    await expect(page.locator('[data-cy="bulk-save-indicator"]')).toHaveCount(0, {
      timeout: 40_000,
    });

    const links = (await glides(page)).filter((g) => g.key.startsWith("link:"));
    expect(links.length).toBeGreaterThan(0);
  });

  test("nothing glides with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await spyOnGlides(page);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    await slowSaves(page, 300);

    await paste(page, LIST);
    await expect(rows(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(page.locator('[data-cy="bulk-save-indicator"]')).toHaveCount(0);

    expect(await glides(page)).toEqual([]);
  });

  test("pasted links' Save rows enter 40ms apart, and the rest glide up when one goes", async ({ page }) => {
    await spyOnGlides(page);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');
    const field = page.getByRole("searchbox", {
      name: "Search your links or paste a link to save",
    });
    const saveRows = page.locator('[data-cy="omnibox-save-row"]');

    await field.fill(LIST.split("\n").join(" "));
    await expect(saveRows).toHaveCount(3);
    const delays = await saveRows.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).animationDelay),
    );
    expect(delays).toEqual(["0s", "0.04s", "0.08s"]);

    // The first row goes (+ saves it): the other two glide up a row.
    await saveRows.first().click();
    await expect(saveRows).toHaveCount(2);
    const rowGlides = (await glides(page)).filter((g) => g.key.startsWith("save:"));
    expect(rowGlides).toHaveLength(2);
    expect(rowGlides.every((g) => g.dy > 10)).toBe(true);
  });

  test("on a folder page the links are filed in that folder", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    await page.goto("/folders/reading");
    await waitForHydration(page, '[data-cy="link-group-empty"]');

    await paste(page, LIST);

    await expect(rows(page)).toHaveCount(3, { timeout: 45_000 });
    await expect(page.getByText(/Saved 3 links to .*Reading/)).toBeVisible();
  });

  test("more than 50 links saves none and says so", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-group-empty"]');

    const many = Array.from({ length: 51 }, (_, i) => `https://site${i}.example`).join(
      "\n",
    );
    await paste(page, many);

    await expect(page.getByText("Paste up to 50 links at a time.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });
});
