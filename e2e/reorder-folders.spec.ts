import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Folders reorder in the folder menu itself: drag a row by its grip (shown
// on hover in place of the emoji; always, at the row's end, on touch
// screens) or Alt+Up / Alt+Down on the highlighted row. Each drop saves, and
// the digit shortcuts follow the new order.

test.use({ colorScheme: "dark" });

const FOLDER_BUTTON = 'button[aria-label^="Folder:"]';

async function openMenu(page: Page) {
  await waitForHydration(page, FOLDER_BUTTON);
  await page.locator(FOLDER_BUTTON).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").first()).toBeVisible();
  return menu;
}

async function closeMenu(page: Page) {
  await page.keyboard.press("Escape");
  // Fully closed: a click on the trigger during the close is dropped.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("style", /pointer-events/);
}

/** Folder names in menu order (the open menu's, or opens it to read them). */
async function menuFolderNames(page: Page) {
  const wasOpen = (await page.getByRole("menu").count()) > 0;
  const menu = wasOpen ? page.getByRole("menu") : await openMenu(page);
  const names = await menu
    .locator('a[href^="/folders/"]')
    .evaluateAll((items) =>
      items.map((item) => item.querySelector(".truncate")?.textContent?.trim() ?? ""),
    );
  if (!wasOpen) await closeMenu(page);
  return names;
}

function folderRow(menu: Locator, name: string) {
  return menu.locator('a[href^="/folders/"]').filter({ hasText: name });
}

/** The visible grip of a row (hovering it first, as a mouse would). */
async function grip(row: Locator) {
  await row.hover();
  const handle = row.locator("[data-folder-grip]:visible");
  await expect(handle).toHaveCount(1);
  return handle;
}

/**
 * Drags `handle` vertically to `toY`, one animation frame per step, as a
 * hand would: Motion reads the pointer once per frame, and WebKit under
 * parallel test load can otherwise get the whole drag, release included,
 * between two frames, so it never reorders.
 */
async function dragTo(
  page: Page,
  handle: Locator,
  toY: number,
  { steps = 12, holdFrames = 0 }: { steps?: number; holdFrames?: number } = {},
) {
  const nextFrame = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const from = (await handle.boundingBox())!;
  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await nextFrame();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(x, startY + ((toY - startY) * step) / steps);
    await nextFrame();
  }
  // Hold there (a pixel of jitter keeps the pointer "moving").
  for (let frame = 0; frame < holdFrames; frame++) {
    await page.mouse.move(x, toY - (frame % 2));
    await nextFrame();
  }
  await page.mouse.up();
}

async function bottomOf(row: Locator) {
  const box = (await row.boundingBox())!;
  return box.y + box.height * 0.9;
}

async function seedThree(seed: {
  folder: (f: { name: string; slug: string }) => Promise<string>;
}) {
  await seed.folder({ name: "Alpha", slug: "alpha" });
  await seed.folder({ name: "Beta", slug: "beta" });
  await seed.folder({ name: "Gamma", slug: "gamma" });
}

test.describe("Reorder folders in the folder menu", () => {
  test("hovering a row swaps its emoji for the grip", async ({ page, seed }, testInfo) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const alpha = folderRow(menu, "Alpha");
    await expect(alpha.locator("[data-folder-grip]:visible")).toHaveCount(0);
    await grip(alpha);
    await expect(alpha.getByText("🦪")).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath("menu-hover-grip.png"),
      clip: { x: 0, y: 0, width: 420, height: 360 },
    });
  });

  test("dragging a row saves the new order without opening a folder", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const handle = await grip(folderRow(menu, "Alpha"));
    await dragTo(page, handle, await bottomOf(folderRow(menu, "Gamma")));

    // The menu stays open and nothing navigated.
    await expect(menu).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
    await expect.poll(() => menuFolderNames(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    await expect(page.getByRole("status").filter({ hasText: "moved" })).toHaveText(
      "Alpha moved to position 3 of 3",
    );

    await closeMenu(page);
    await page.waitForLoadState("networkidle");
    await page.reload();
    expect(await menuFolderNames(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/folders\/beta$/);
  });

  test("pressing the grip without dragging doesn't open the folder", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    await (await grip(folderRow(menu, "Beta"))).click();
    await expect(menu).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("Alt+ArrowDown moves the highlighted row and keeps it highlighted", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const alpha = folderRow(menu, "Alpha");
    await alpha.focus();
    await page.keyboard.press("Alt+ArrowDown");

    expect(await menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);
    await expect(alpha).toBeFocused();
    await expect(page).toHaveURL(/\/home$/);

    await closeMenu(page);
    await page.waitForLoadState("networkidle");
    await page.reload();
    expect(await menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  test("a new folder goes to the bottom after reordering", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await folderRow(menu, "Gamma").focus();
    await page.keyboard.press("Alt+ArrowUp");
    expect(await menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta"]);

    await menu.getByRole("menuitem", { name: "New folder" }).click();
    await page.getByLabel("Folder name").fill("Delta");
    await page.getByRole("button", { name: "Create folder" }).click();
    await expect(page).toHaveURL(/\/folders\/delta$/);

    expect(await menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta", "Delta"]);
  });

  test("the folder list scrolls while dragging near its edge", async ({ page, seed }) => {
    const names = Array.from({ length: 14 }, (_, i) => `Folder ${String(i + 1).padStart(2, "0")}`);
    for (const name of names) {
      await seed.folder({ name, slug: name.toLowerCase().replace(" ", "-") });
    }
    await page.goto("/home");
    const menu = await openMenu(page);
    const list = menu
      .locator('[role="group"]')
      .filter({ has: page.locator('a[href^="/folders/"]') });
    const box = (await list.boundingBox())!;

    const handle = await grip(folderRow(menu, "Folder 01"));
    // Hold near the list's bottom edge for a while.
    await dragTo(page, handle, box.y + box.height - 4, { holdFrames: 60 });

    await expect
      .poll(async () => (await menuFolderNames(page)).indexOf("Folder 01"))
      .toBeGreaterThan(7);
  });

  test("no grips with fewer than two folders", async ({ page, seed }) => {
    await seed.folder({ name: "Alpha", slug: "alpha" });
    await page.goto("/home");
    const menu = await openMenu(page);
    await folderRow(menu, "Alpha").hover();
    await expect(menu.locator("[data-folder-grip]")).toHaveCount(0);
  });
});

test.describe("Reorder folders on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("each row shows its grip at the end, keeps its emoji and hides the digit key", async ({ page, seed }, testInfo) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const beta = folderRow(menu, "Beta");
    const handle = beta.locator("[data-folder-grip]:visible");
    await expect(handle).toHaveCount(1);
    await expect(beta.getByText("🦪")).toBeVisible();
    await expect(beta.locator("kbd")).toBeHidden();
    // At the row's end, after the name.
    const nameBox = (await beta.locator(".truncate").boundingBox())!;
    expect((await handle.boundingBox())!.x).toBeGreaterThan(nameBox.x + nameBox.width);
    await page.screenshot({ path: testInfo.outputPath("menu-touch-grips.png") });

    await dragTo(page, handle, (await folderRow(menu, "Alpha").boundingBox())!.y + 2);
    await expect.poll(() => menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});
