import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The owner's grid: chosen in the user menu (View mode: List / Grid), saved on the
// account, and the shared folder's cards and masonry with the owner's
// actions (open marks read, select, the row menu).

const cards = (page: Page) => page.locator('[data-cy="link-card"]');
const card = (page: Page, title: string) => cards(page).filter({ hasText: title });

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"], [data-cy="link-card"]');
  await page.waitForLoadState("networkidle");
}

/** The user menu's "View mode", opened to its List / Grid choices. */
async function openViewMode(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "View mode" }).click();
}

async function chooseView(page: Page, view: "List" | "Grid") {
  await openViewMode(page);
  const item = page.getByRole("menuitemradio", { name: view });
  const saved = page.waitForResponse(
    (res) => res.url().endsWith("/api/user/layout") && res.request().method() === "PATCH",
  );
  await item.click();
  expect((await saved).ok()).toBe(true);
}

test.describe("Owner grid view", () => {
  test("the user menu switches Home to a grid, remembered on the account", async ({ page, seed }, testInfo) => {
    for (const title of ["Alpha", "Bravo", "Charlie"]) {
      await seed.link({ url: `https://${title.toLowerCase()}.example`, title });
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    await openHome(page);
    await expect(cards(page)).toHaveCount(0);

    await chooseView(page, "Grid");
    await expect(cards(page)).toHaveCount(3);
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(0);
    // The day heading stays.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath("grid.png") });

    // Saved on the account: the server renders the grid after a reload.
    await page.reload();
    await waitForHydration(page, '[data-cy="link-card"]');
    await expect(cards(page)).toHaveCount(3);
    await openViewMode(page);
    await expect(page.getByRole("menuitemradio", { name: "Grid" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await chooseView(page, "List");
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(3);
    await expect(cards(page)).toHaveCount(0);
  });

  test("a card opens its link (marking it read), selects, and has the row menu", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seed.link({ url: "https://bravo.example", title: "Bravo" });
    await openHome(page);
    await chooseView(page, "Grid");

    // Open: a new tab, and the card reads as read.
    await page.context().route("https://alpha.example/**", (route) => route.abort());
    const popup = page.waitForEvent("popup");
    await card(page, "Alpha").locator("a[href]").click();
    await (await popup).close();
    await expect(card(page, "Alpha").locator("a[href]")).toHaveAttribute(
      "aria-label",
      "Alpha (read, opens in new tab)",
    );

    // Select: the checkbox in the corner, then a click toggles a card.
    await card(page, "Bravo").hover();
    await page.getByRole("checkbox", { name: "Select Bravo" }).click();
    const bar = page.getByRole("toolbar", { name: "Selected links" });
    await expect(bar).toContainText("1 selected");
    const noPopup = page.waitForEvent("popup", { timeout: 800 }).catch(() => null);
    await card(page, "Alpha").click();
    expect(await noPopup).toBeNull();
    await expect(bar).toContainText("2 selected");
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);

    // The row menu, from the corner: Delete fades the card out with Undo.
    await card(page, "Bravo").hover();
    await card(page, "Bravo").getByRole("button", { name: "Open link menu" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(card(page, "Bravo")).toHaveCount(0);
    await expect(page.getByText("Link deleted")).toBeVisible();
  });

  test("Folder tags show each link's folder on Home, saved on the account", async ({ page, seed }, testInfo) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await seed.link({ url: "https://alpha.example", title: "Alpha", folderId: reading });
    await seed.link({ url: "https://bravo.example", title: "Bravo" });
    await openHome(page);
    const tags = page.locator('[data-cy="folder-tag"]');
    await expect(tags).toHaveCount(0);

    // On: the menu stays open, and the filed link gets its folder's tag.
    await page.getByRole("button", { name: "Account menu" }).click();
    const toggle = page.getByRole("menuitemcheckbox", { name: "Folder tags" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    const saved = page.waitForResponse(
      (res) => res.url().endsWith("/api/user/layout") && res.request().method() === "PATCH",
    );
    await toggle.click();
    expect((await saved).ok()).toBe(true);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(tags).toHaveCount(1);
    await expect(page.locator('[data-cy="link-item"]').filter({ hasText: "Alpha" })).toContainText("Reading");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath("tags-list.png") });

    // Saved: still on after a reload, in the grid too.
    await page.reload();
    await waitForHydration(page, '[data-cy="link-item"]');
    await expect(tags).toHaveCount(1);
    await chooseView(page, "Grid");
    await expect(card(page, "Alpha").locator('[data-cy="folder-tag"]')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath("tags-grid.png") });

    // A folder page shows no tags: every link there is in that folder.
    await page.goto("/folders/reading");
    await waitForHydration(page, '[data-cy="link-card"]');
    await expect(tags).toHaveCount(0);
  });
});

test.describe("Folder tags on phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("only the folder's icon, its name in a tooltip on tap", async ({ page, seed }, testInfo) => {
    const folder = await seed.folder({ name: "Design Engineer", slug: "design", emoji: "🧑‍🎨" });
    await seed.link({ url: "https://alpha.example", title: "Alpha", folderId: folder });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.getByRole("button", { name: "Account menu" }).tap();
    await page.getByRole("menuitemcheckbox", { name: "Folder tags" }).tap();
    await page.keyboard.press("Escape");

    const popups: unknown[] = [];
    page.on("popup", (popup) => popups.push(popup));
    for (const view of ["list", "grid"] as const) {
      if (view === "grid") {
        await page.getByRole("button", { name: "Account menu" }).tap();
        await page.getByRole("menuitem", { name: "View mode" }).tap();
        await page.getByRole("menuitemradio", { name: "Grid" }).tap();
        await waitForHydration(page, '[data-cy="link-card"]');
      }
      const tag = page.getByRole("button", { name: "Folder: Design Engineer" });
      await expect(tag).toBeVisible();
      // The icon only: the name isn't drawn next to it.
      await expect(tag).not.toContainText("Design Engineer");
      await tag.tap();
      await expect(page.getByRole("tooltip")).toContainText("Design Engineer");
      await page.screenshot({ path: testInfo.outputPath(`tag-${view}.png`) });
      await page.touchscreen.tap(195, 700);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    }
    // The taps never opened the link (or selected it).
    expect(popups).toHaveLength(0);
    await expect(page.getByRole("toolbar", { name: "Selected links" })).toHaveCount(0);

    // In a card, the icon sits centered under the favicon.
    const offset = await card(page, "Alpha").evaluate((el) => {
      const tag = el.querySelector('[data-cy="folder-tag"]')!.getBoundingClientRect();
      const info = el.querySelector('[data-cy="folder-tag"]')!.closest("span.grid")!;
      const fav = info.firstElementChild!.firstElementChild!.getBoundingClientRect();
      return tag.left + tag.width / 2 - (fav.left + fav.width / 2);
    });
    expect(Math.abs(offset)).toBeLessThan(0.5);
  });

  test("a card's menu closes on one tap outside, with Move to folder open", async ({ page, seed }) => {
    const folder = await seed.folder({ name: "Design Engineer", slug: "design", emoji: "🧑‍🎨" });
    await seed.link({ url: "https://alpha.example", title: "Alpha", folderId: folder });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.getByRole("button", { name: "Account menu" }).tap();
    await page.getByRole("menuitem", { name: "View mode" }).tap();
    await page.getByRole("menuitemradio", { name: "Grid" }).tap();
    await waitForHydration(page, '[data-cy="link-card"]');

    await card(page, "Alpha").getByRole("button", { name: "Open link menu" }).tap();
    await page.getByRole("menuitem", { name: "Move to folder" }).tap();
    await expect(page.getByRole("menuitem", { name: /Design Engineer/ }).first()).toBeVisible();
    // The press inside the menu used to be stopped on its way up, so
    // Radix took the next outside tap for an inside one.
    await page.touchscreen.tap(195, 780);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});

