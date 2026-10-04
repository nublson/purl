import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

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
});
