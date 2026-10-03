import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

const TEST_URL = "https://nublson.com";
const MENU_BUTTON = '[aria-label="Open link menu"]';

const linkItems = (page: Page) => page.locator('[data-cy="link-item"]');
const emptyState = (page: Page) => page.locator('[data-cy="link-group-empty"]');

async function openLinkMenu(page: Page) {
  await waitForHydration(page, MENU_BUTTON);
  // The button is opacity-0 until the row is hovered on pointer devices.
  await linkItems(page).first().hover();
  await page.locator(MENU_BUTTON).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function deleteFirstLink(page: Page) {
  await openLinkMenu(page);
  await page.locator('[data-cy="delete-link-menu-item"]').click();
}

test.describe("Link management", () => {
  test("a new user with no links sees the empty state", async ({ page }) => {
    await page.goto("/home");
    await expect(emptyState(page)).toBeVisible();
    await expect(page.getByText("No links yet")).toBeVisible();
  });

  test("a seeded link shows its title and domain", async ({ page, seed }) => {
    await seed.link({ url: TEST_URL, title: "Nubelson Fernandes" });

    await page.goto("/home");
    await expect(linkItems(page)).toHaveCount(1);
    await expect(linkItems(page)).toContainText("Nubelson Fernandes");
    await expect(linkItems(page)).toContainText("nublson.com");
  });

  test("a deleted link is gone, and stays gone after the Undo window", async ({ page, seed }) => {
    await seed.link({ url: TEST_URL });
    await page.goto("/home");
    await expect(linkItems(page)).toHaveCount(1);

    await deleteFirstLink(page);
    await expect(linkItems(page)).toHaveCount(0);
    await expect(emptyState(page)).toBeVisible();
    const toast = page.getByText("Link deleted");
    await expect(toast).toBeVisible();

    // The DELETE is sent as the toast closes (5s). A reload right then can
    // beat the server to processing it, so reload until the server's list is
    // empty.
    await expect(toast).toBeHidden({ timeout: 10_000 });
    await expect(async () => {
      await page.reload();
      await expect(emptyState(page)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  });

  test("Undo on 'Link deleted' brings the link back", async ({ page, seed }) => {
    await seed.link({ url: TEST_URL });
    await page.goto("/home");

    await deleteFirstLink(page);
    await expect(linkItems(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(linkItems(page)).toHaveCount(1);

    // Undone before the toast closed, so nothing was deleted on the server.
    await expect(page.getByText("Link deleted")).toBeHidden({ timeout: 10_000 });
    await page.reload();
    await expect(linkItems(page)).toHaveCount(1);
  });

  test("Move to folder files the link into that folder", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await seed.link({ url: TEST_URL });
    await page.goto("/home");

    await openLinkMenu(page);
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
    await page.getByRole("menuitem", { name: "Reading" }).click();
    await expect(page.getByText("Moved to 📚 Reading")).toBeVisible();

    await page.goto("/folders/reading");
    await expect(linkItems(page)).toHaveCount(1);
  });
});

test.describe("Link management, focus after delete", () => {
  test("the next row gets focus without a ring after a mouse delete, and an unclipped ring after a keyboard delete", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await seed.link({ url: "https://b.example", title: "Bravo" });
    await seed.link({ url: "https://c.example", title: "Charlie" });
    await page.goto("/home");
    const rows = page.locator('[data-cy="link-item"]');
    await expect(rows).toHaveCount(3);

    // Mouse: focus moves on, but no ring.
    await waitForHydration(page, MENU_BUTTON);
    await rows.first().hover();
    await rows.first().locator(MENU_BUTTON).click();
    await page.locator('[data-cy="delete-link-menu-item"]').click();
    await expect(rows).toHaveCount(2);
    const next = rows.first().locator("> a[href]");
    await expect(next).toBeFocused();
    expect(await next.evaluate((el) => el.matches(":focus-visible"))).toBe(false);

    // Keyboard: open the menu and delete with Enter; the ring shows, inset.
    await rows.first().locator(MENU_BUTTON).focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-cy="delete-link-menu-item"]').focus();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(1);
    const last = rows.first().locator("> a[href]");
    await expect(last).toBeFocused();
    expect(await last.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(await last.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset");
  });
});
