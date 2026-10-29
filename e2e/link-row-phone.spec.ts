import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import { silentWav } from "./support/media";

// Link rows on phones: the row menu opens its folders in place, and rows
// don't start a text selection on touch (a long-press selects the row).

test.use({
  colorScheme: "dark",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

const row = (page: Page, title: string) =>
  page.locator('[data-cy="link-item"]').filter({ hasText: title });

/** A finger held on `target` for 700ms, then lifted (Chromium: raw touch events). */
async function longPress(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"]');
  await page.waitForLoadState("networkidle");
}

test.describe("Link rows on phones", () => {
  test("the row menu opens its folders right under Move to folder", async ({ page, seed }, testInfo) => {
    await seed.folder({ name: "Later", slug: "later", emoji: "⏳" });
    const current = await seed.folder({
      name: "A Folder With A Rather Long Name",
      slug: "long",
      emoji: "📚",
    });
    await seed.link({ url: "https://alpha.example", title: "Alpha", folderId: current });
    await openHome(page);

    await row(page, "Alpha").getByRole("button", { name: "Open link menu" }).tap();
    const menu = page.getByRole("menu");
    // Layout width: the menu's open animation scales it.
    const menuWidth = () => menu.evaluate((el) => (el as HTMLElement).offsetWidth);
    const closedWidth = await menuWidth();
    const trigger = page.getByRole("menuitem", { name: "Move to folder" });
    await trigger.tap();
    const folder = page.getByRole("menuitem", { name: /Later/ });
    await expect(folder).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Remove from A Folder/ })).toBeVisible();
    // Below its trigger, inside the same menu (not a side submenu).
    const triggerBox = (await trigger.boundingBox())!;
    // Once its 4px entrance has settled.
    await expect
      .poll(async () => (await folder.boundingBox())!.y)
      .toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1);
    const folderBox = (await folder.boundingBox())!;
    expect(folderBox.x + folderBox.width).toBeLessThanOrEqual(390);
    // One width, open or not, and the folders line up with the menu's items.
    expect(await menuWidth()).toBe(closedWidth);
    expect(folderBox.x).toBe((await page.getByRole("menuitem", { name: "Edit" }).boundingBox())!.x);
    // The folders end in a separator before Edit.
    const separators = await menu.getByRole("separator").count();
    expect(separators).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath("folders-inline.png") });

    await folder.tap();
    await expect(page.getByText(/Moved to .*Later/)).toBeVisible();
  });

  test("rows don't start a text selection on touch", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    const userSelect = await row(page, "Alpha").evaluate(
      (el) => getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect,
    );
    expect(userSelect).toBe("none");
  });

  test("tapping the row menu doesn't select the row", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    // The menu opens on the press, so the lift never reaches the row: a
    // long-press started there used to select it 500ms later.
    await row(page, "Alpha").getByRole("button", { name: "Open link menu" }).tap();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(row(page, "Alpha")).not.toHaveAttribute("data-selected");
    await expect(page.getByRole("checkbox", { name: "Select all" })).toHaveCount(0);
  });

  test("an audio row: a tap plays it; its menu is shown", async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seed.link({
      url: "https://sounds.example/song.wav",
      title: "Song",
      contentType: "AUDIO",
      duration: 10,
    });
    await openHome(page);

    const song = row(page, "Song");
    const toggle = song.locator("[data-audio-toggle]");
    // A row like the others: 56px on phones, its icon, no bar.
    expect(Math.abs((await song.boundingBox())!.height - 56)).toBeLessThanOrEqual(1);
    await expect(song.locator('[data-face="audio"]')).toHaveCount(0);
    await expect(song.locator('[data-cy="row-favicon"]')).toBeVisible();
    // On touch the menu is always shown, over the row's end.
    await expect(song.getByRole("button", { name: "Open link menu" })).toBeVisible();
    // No text selection from a press on it.
    expect(
      await song.evaluate(
        (el) => getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect,
      ),
    ).toBe("none");

    const title = (await song.locator('[data-slot="item-title"]').boundingBox())!;
    await page.touchscreen.tap(title.x + 20, title.y + title.height / 2);
    await expect(toggle).toHaveAttribute("aria-label", "Pause Song");
    await expect(page.getByText("1 selected")).toHaveCount(0);
    await expect(song).not.toHaveAttribute("data-selected");
    // The mark in the icon's place (24px on phones); the menu as before.
    const mark = song.locator('[data-cy="row-favicon"] [data-row-mark]');
    await expect(mark).toHaveAttribute("data-row-mark", "playing");
    await expect(mark).toBeVisible();
    expect(await mark.evaluate((el: HTMLElement) => el.offsetWidth)).toBe(24);
    await expect(song.getByRole("button", { name: "Open link menu" })).toBeVisible();
    const rowBox = (await song.boundingBox())!;
    expect(Math.abs(rowBox.height - 56)).toBeLessThanOrEqual(1);

    // A second tap pauses it.
    await page.touchscreen.tap(title.x + 20, title.y + title.height / 2);
    await expect(toggle).toHaveAttribute("aria-label", "Play Song");
    await expect(mark).toHaveCount(0);
  });

  test("an audio row: a long-press selects it, and doesn't play it", async ({
    page,
    seed,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "raw touch events are Chromium-only");
    await seed.link({
      url: "https://sounds.example/song.wav",
      title: "Song",
      contentType: "AUDIO",
      duration: 10,
    });
    await openHome(page);
    const song = row(page, "Song");
    await longPress(page, song.locator('[data-slot="item-title"]'));
    await expect(song).toHaveAttribute("data-selected", "true");
    await expect(song.getByRole("checkbox", { name: "Select Song" })).toBeChecked();
    // The lift after the long-press neither unselects nor plays it.
    await page.waitForTimeout(300);
    await expect(song).toHaveAttribute("data-selected", "true");
    await expect(song.locator("[data-audio-toggle]")).toHaveAttribute("aria-label", "Play Song");
    await expect(song.locator("[data-row-mark]")).toHaveCount(0);
  });
});
