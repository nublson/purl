import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The motion pass: rows animate back on Undo and out when moved out of a
// folder; the search field shows focus and cross-fades ✕ / ⌘K.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const field = (page: Page) =>
  page.getByRole("searchbox", { name: "Search your links or paste a link to save" });
const MENU_BUTTON = '[aria-label="Open link menu"]';

test.describe("Motion", () => {
  test("Undo plays a deleted row back in", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await page.goto("/home");
    await waitForHydration(page, MENU_BUTTON);
    await rows(page).first().hover();
    await page.locator(MENU_BUTTON).click();
    await page.locator('[data-cy="delete-link-menu-item"]').click();
    await expect(rows(page)).toHaveCount(0);

    // Record in the page whether the row plays its entrance (200ms: too
    // short to catch reliably from outside under load).
    await page.evaluate(() => {
      const w = window as Window & { __sawRestore?: boolean };
      w.__sawRestore = false;
      const check = () => {
        for (const row of document.querySelectorAll('[data-cy="link-item"]')) {
          if (row.className.includes("animate-in")) w.__sawRestore = true;
        }
      };
      new MutationObserver(check).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    });
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rows(page)).toHaveCount(1);
    // Then it's an ordinary row again.
    await expect(rows(page).first()).not.toHaveClass(/animate-in/);
    expect(
      await page.evaluate(() => (window as Window & { __sawRestore?: boolean }).__sawRestore),
    ).toBe(true);
  });

  test("a row moved out of the folder on screen fades out before it goes", async ({ page, seed }) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading" });
    await seed.folder({ name: "Work", slug: "work" });
    await seed.link({ url: "https://a.example", title: "Alpha", folderId: reading });
    await seed.link({ url: "https://b.example", title: "Bravo", folderId: reading });
    await page.goto("/folders/reading");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.waitForLoadState("networkidle");

    await rows(page).first().hover();
    await page.getByRole("checkbox", { name: "Select Bravo" }).click();
    await page.getByRole("toolbar", { name: "Selected links" }).getByRole("button", { name: "Move" }).click();
    // Record, inside the page, whether Bravo's row ever plays the exit: the
    // fade lasts 200ms, too short to catch reliably from outside under load.
    await page.evaluate(() => {
      const w = window as Window & { __sawLeave?: boolean };
      w.__sawLeave = false;
      new MutationObserver(() => {
        for (const row of document.querySelectorAll('[data-cy="link-item"]')) {
          if (row.textContent?.includes("Bravo") && row.className.includes("animate-out")) {
            w.__sawLeave = true;
          }
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    await page.getByRole("menuitem", { name: "Work" }).click();

    const bravo = rows(page).filter({ hasText: "Bravo" });
    await expect(bravo).toHaveCount(0, { timeout: 15_000 });
    await expect(rows(page)).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as Window & { __sawLeave?: boolean }).__sawLeave),
    ).toBe(true);
  });

  test("the search field shows focus and cross-fades ✕ with the ⌘K hint", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await page.goto("/home");
    await waitForHydration(page, 'form[role="search"] input');
    const form = page.locator('form[role="search"]');
    const clear = page.getByRole("button", { name: "Clear search", includeHidden: true });

    const before = await form.evaluate((el) => getComputedStyle(el).boxShadow);
    await field(page).focus();
    await expect.poll(() => form.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(before);

    // Empty: ✕ is invisible and inert.
    await expect(clear).toHaveCSS("opacity", "0");
    await expect(clear).toHaveAttribute("inert", "");
    await field(page).fill("al");
    await expect(clear).toHaveCSS("opacity", "1");
    await expect(clear).not.toHaveAttribute("inert");
  });

  test("a saved link's details arrive in place, in the Save row and in the list", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, 'form[role="search"] input');
    await page.waitForLoadState("networkidle");

    await field(page).fill("example.com");
    const saveRow = page.locator('[data-cy="omnibox-save-row"]');
    // The preview's title replaces the URL with the arrival animation.
    const previewTitle = saveRow.getByText("Example Domain");
    await expect(previewTitle).toBeVisible({ timeout: 15_000 });
    await expect(previewTitle).toHaveClass(/animate-in/);

    // Record in the page whether the new row's title plays the arrival
    // (it lasts a moment: too short to catch reliably from outside).
    await page.evaluate(() => {
      const w = window as Window & { __sawArrive?: boolean };
      w.__sawArrive = false;
      new MutationObserver(() => {
        for (const row of document.querySelectorAll('[data-cy="link-item"]')) {
          if (
            row.textContent?.includes("Example Domain") &&
            row.querySelector('[class*="animate-in"]')
          ) {
            w.__sawArrive = true;
          }
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    });
    await field(page).press("Enter");
    const row = rows(page).filter({ hasText: "Example Domain" });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    // Only for a moment: then it's an ordinary row.
    await expect(row.getByText("Example Domain")).not.toHaveClass(/animate-in/);
    expect(
      await page.evaluate(() => (window as Window & { __sawArrive?: boolean }).__sawArrive),
    ).toBe(true);
  });
});
