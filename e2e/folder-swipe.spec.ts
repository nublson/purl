import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// On touch screens a folder row in the folder menu swipes right to edit and
// left to delete: past half the button it uncovers it stays open on it, far
// enough it acts at once (the edit dialog; the delete dialog, which
// confirms). Playwright can only tap, so
// the swipe is touch pointer events sent to the row (what the row listens
// to); the taps are real.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FOLDER_BUTTON = 'button[aria-label^="Folder:"]';

async function openMenu(page: Page) {
  await waitForHydration(page, FOLDER_BUTTON);
  await page.locator(FOLDER_BUTTON).tap();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").first()).toBeVisible();
  return menu;
}

/** The swipeable part of the row that links to `name`. */
function swipeRow(menu: Locator, name: string) {
  return menu.locator("[data-swipe-row]").filter({ hasText: name });
}

/** Drags the row left (or right, negative) by `distance` px, in 10 steps. */
async function swipe(row: Locator, distance: number) {
  await row.evaluate(async (el, distance) => {
    const box = el.getBoundingClientRect();
    const y = box.top + box.height / 2;
    const x0 = box.left + box.width * (distance > 0 ? 0.6 : 0.3);
    const fire = (type: string, x: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 41,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
    fire("pointerdown", x0);
    for (let step = 1; step <= 10; step++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      fire("pointermove", x0 - (distance * step) / 10);
    }
    fire("pointerup", x0 - distance);
    // The click a real release would send: the row must swallow it.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, distance);
}

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, FOLDER_BUTTON);
}

test.describe("Swipe to delete a folder (touch)", () => {
  test("a short swipe opens the row on Delete, which asks first", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    await openHome(page);
    const menu = await openMenu(page);
    const row = swipeRow(menu, "Reading");

    await swipe(row, 60);
    const action = menu.locator("[data-folder-swipe-delete]");
    await expect(action).toBeVisible();
    await expect(row).toHaveCSS("transform", /matrix\(1, 0, 0, 1, -72, 0\)/);
    // The release didn't open the folder.
    await expect(page).toHaveURL(/\/home$/);

    // A tap on the open row shuts it and goes nowhere.
    await row.tap();
    await expect(action).toBeHidden();
    await expect(page).toHaveURL(/\/home$/);

    await swipe(row, 60);
    await action.tap();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Delete");
    await expect(dialog).toContainText("Reading");
    await dialog.getByRole("button", { name: "Cancel" }).tap();
    await expect(dialog).toHaveCount(0);
  });

  test("a long swipe asks at once; a short one springs back", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    await openHome(page);
    let menu = await openMenu(page);

    await swipe(swipeRow(menu, "Reading"), 10);
    await expect(menu.locator("[data-folder-swipe-delete]")).toBeHidden();

    await swipe(swipeRow(menu, "Reading"), 200);
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Reading");
    await dialog.getByRole("button", { name: "Cancel" }).tap();

    // The menu opens again with the row back in place.
    menu = await openMenu(page);
    await expect(swipeRow(menu, "Reading")).toHaveCSS("transform", "none");
  });

  test("a swipe right opens the row on Edit, which opens the edit dialog", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    await openHome(page);
    const menu = await openMenu(page);
    const row = swipeRow(menu, "Reading");

    await swipe(row, -60);
    const edit = menu.locator("[data-folder-swipe-edit]");
    await expect(edit).toBeVisible();
    await expect(menu.locator("[data-folder-swipe-delete]")).toBeHidden();
    await expect(row).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 72, 0\)/);
    await expect(page).toHaveURL(/\/home$/);

    await edit.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: /name/i })).toHaveValue("Reading");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // A long swipe right opens it at once.
    const again = await openMenu(page);
    await swipe(swipeRow(again, "Reading"), -200);
    await expect(page.getByRole("dialog").getByRole("textbox", { name: /name/i })).toHaveValue(
      "Reading",
    );
  });
});
