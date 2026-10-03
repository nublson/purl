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

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rows(page).first()).toHaveClass(/animate-in/);
    await expect(rows(page).first()).not.toHaveClass(/animate-in/);
    await expect(rows(page)).toHaveCount(1);
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
    await page.getByRole("menuitem", { name: "Work" }).click();

    const bravo = rows(page).filter({ hasText: "Bravo" });
    await expect(bravo).toHaveClass(/animate-out/);
    await expect(bravo).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
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

    await field(page).press("Enter");
    const row = rows(page).filter({ hasText: "Example Domain" });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.getByText("Example Domain")).toHaveClass(/animate-in/);
    // Only for a moment: then it's an ordinary row.
    await expect(row.getByText("Example Domain")).not.toHaveClass(/animate-in/);
  });
});
