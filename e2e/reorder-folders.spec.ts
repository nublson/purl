import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Folders keep the order the user sets in the Reorder folders dialog: the
// folder menu and the digit shortcuts follow it.

test.use({ colorScheme: "dark" });

const FOLDER_BUTTON = 'button[aria-label^="Folder:"]';

async function openMenu(page: Page) {
  await waitForHydration(page, FOLDER_BUTTON);
  await page.locator(FOLDER_BUTTON).click();
  return page.getByRole("menu");
}

async function openReorderDialog(page: Page) {
  const menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "Reorder folders" }).click();
  const dialog = page.getByRole("dialog", { name: "Reorder folders" });
  // The list loads on demand; its rows mark it ready.
  await expect(dialog.getByRole("listitem").first()).toBeVisible();
  return dialog;
}

/** Folder names as the folder menu lists them (after Home). */
async function menuFolderNames(page: Page) {
  const menu = await openMenu(page);
  await expect(menu.getByRole("menuitem").first()).toBeVisible();
  const names = await menu
    .locator('a[href^="/folders/"]')
    .evaluateAll((items) =>
      items.map((item) => item.querySelector(".truncate")?.textContent?.trim() ?? ""),
    );
  await page.keyboard.press("Escape");
  // Fully closed: a click on the trigger during the close is dropped.
  await expect(menu).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("style", /pointer-events/);
  return names;
}

async function seedThree(seed: {
  folder: (f: { name: string; slug: string }) => Promise<string>;
}) {
  await seed.folder({ name: "Alpha", slug: "alpha" });
  await seed.folder({ name: "Beta", slug: "beta" });
  await seed.folder({ name: "Gamma", slug: "gamma" });
}

/**
 * Drags `handle` down to the bottom of `target` one animation frame per step,
 * as a hand would: Motion reads the pointer once per frame, and WebKit
 * under parallel test load can otherwise get the whole drag, release
 * included, between two frames, so it never reorders.
 */
async function dragVertically(page: Page, handle: Locator, target: Locator) {
  const nextFrame = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height * 0.9;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await nextFrame();
  const steps = 12;
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(x, startY + ((endY - startY) * step) / steps);
    await nextFrame();
  }
  await page.mouse.up();
}

function rowNames(dialog: Locator) {
  return dialog.getByRole("listitem").evaluateAll((rows) =>
    rows.map((row) => row.querySelector(".truncate")?.textContent ?? ""),
  );
}

test.describe("Reorder folders", () => {
  test("moves a folder to the top with Move up", async ({ page, seed }, testInfo) => {
    await seedThree(seed);
    await page.goto("/home");

    const dialog = await openReorderDialog(page);
    await dialog.getByRole("button", { name: "Move Gamma up" }).click();
    await dialog.getByRole("button", { name: "Move Gamma up" }).click();
    expect(await rowNames(dialog)).toEqual(["Gamma", "Alpha", "Beta"]);
    await expect(dialog.getByRole("status")).toHaveText(
      "Gamma moved to position 1 of 3",
    );
    await page.waitForTimeout(400); // let the rows' layout animation settle
    await page.screenshot({ path: testInfo.outputPath("reorder-dialog.png") });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);

    expect(await menuFolderNames(page)).toEqual(["Gamma", "Alpha", "Beta"]);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/folders\/gamma$/);
  });

  test("drags a folder by its grip and keeps the order after reload", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");

    const dialog = await openReorderDialog(page);
    const grip = dialog
      .getByRole("listitem")
      .filter({ hasText: "Alpha" })
      .locator("[data-reorder-grip]");
    const target = dialog.getByRole("listitem").filter({ hasText: "Gamma" });
    await dragVertically(page, grip, target);
    await expect.poll(() => rowNames(dialog)).toEqual(["Beta", "Gamma", "Alpha"]);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);

    // Wait for the save before reloading.
    await expect.poll(() => menuFolderNames(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    await page.waitForLoadState("networkidle");
    await page.reload();
    expect(await menuFolderNames(page)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  test("Cancel discards changes", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");

    const dialog = await openReorderDialog(page);
    await dialog.getByRole("button", { name: "Move Alpha down" }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    expect(await menuFolderNames(page)).toEqual(["Alpha", "Beta", "Gamma"]);
    const reopened = await openReorderDialog(page);
    expect(await rowNames(reopened)).toEqual(["Alpha", "Beta", "Gamma"]);
    await expect(reopened.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("a new folder goes to the bottom after reordering", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");

    const dialog = await openReorderDialog(page);
    await dialog.getByRole("button", { name: "Move Gamma up" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta"]);

    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: "New folder" }).click();
    await page.getByLabel("Folder name").fill("Delta");
    await page.getByRole("button", { name: "Create folder" }).click();
    await expect(page).toHaveURL(/\/folders\/delta$/);

    expect(await menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta", "Delta"]);
  });

  test("Alt+ArrowDown moves the focused row and keeps focus", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");

    const dialog = await openReorderDialog(page);
    const alpha = dialog.getByRole("listitem").filter({ hasText: "Alpha" });
    await alpha.focus();
    await page.keyboard.press("Alt+ArrowDown");

    expect(await rowNames(dialog)).toEqual(["Beta", "Alpha", "Gamma"]);
    await expect(alpha).toBeFocused();
  });

  test("hides Reorder folders with fewer than two folders", async ({ page, seed }) => {
    await seed.folder({ name: "Alpha", slug: "alpha" });
    await page.goto("/home");

    const menu = await openMenu(page);
    await expect(menu.getByRole("menuitem", { name: "New folder" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Reorder folders" })).toHaveCount(0);
  });
});
