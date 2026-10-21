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

  test("the grid follows the window's width without a reload", async ({ page, seed }) => {
    for (const title of ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]) {
      await seed.link({ url: `https://${title.toLowerCase()}.example`, title });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await openHome(page);
    await chooseView(page, "Grid");
    await expect(cards(page)).toHaveCount(6);
    const columns = async () =>
      new Set(
        await cards(page).evaluateAll((all) =>
          all.map((el) => Math.round(el.getBoundingClientRect().left)),
        ),
      ).size;
    await expect.poll(columns).toBe(4);

    // Narrower than md: two columns, every card on screen.
    await page.setViewportSize({ width: 500, height: 900 });
    await expect.poll(columns).toBe(2);
    const rights = await cards(page).evaluateAll((all) =>
      all.map((el) => el.getBoundingClientRect().right),
    );
    expect(Math.max(...rights)).toBeLessThanOrEqual(500);

    // Small tablets (an iPad mini's 744px portrait): three columns, on screen.
    await page.setViewportSize({ width: 744, height: 1000 });
    await expect.poll(columns).toBe(3);
    const tabletRights = await cards(page).evaluateAll((all) =>
      all.map((el) => el.getBoundingClientRect().right),
    );
    expect(Math.max(...tabletRights)).toBeLessThanOrEqual(744);

    // And back.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(columns).toBe(4);
  });

  test("a card opens its link, selects, and has the row menu", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seed.link({ url: "https://bravo.example", title: "Bravo" });
    await openHome(page);
    await chooseView(page, "Grid");

    // Open: a new tab.
    await page.context().route("https://alpha.example/**", (route) => route.abort());
    const popup = page.waitForEvent("popup");
    await card(page, "Alpha").locator("a[href]").click();
    await (await popup).close();
    await expect(card(page, "Alpha").locator("a[href]")).toHaveAttribute(
      "aria-label",
      "Alpha (opens in new tab)",
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
    // A row: the folder's emoji as a badge on the favicon's corner.
    const badges = page.locator('[data-cy="folder-badge"]:visible');
    await expect(badges).toHaveCount(0);

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
    await expect(badges).toHaveCount(1);
    // No chip in the row; the name is the link's description.
    const alpha = page.locator('[data-cy="link-item"]').filter({ hasText: "Alpha" });
    await expect(alpha.locator('[data-cy="folder-tag"]')).toHaveCount(0);
    await expect(alpha.getByRole("link", { name: /^Alpha/ })).toHaveAccessibleDescription(/In Reading/);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath("tags-list.png") });

    // Saved: still on after a reload, in the grid too.
    await page.reload();
    await waitForHydration(page, '[data-cy="link-item"]');
    await expect(badges).toHaveCount(1);
    await chooseView(page, "Grid");
    await expect(card(page, "Alpha").locator('[data-cy="folder-badge"]:visible')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath("tags-grid.png") });

    // Beside the card's ⋯, on hover: a link straight to its folder.
    await card(page, "Alpha").hover();
    await card(page, "Alpha").getByRole("link", { name: "Go to Reading" }).click();
    await expect(page).toHaveURL(/\/folders\/reading$/);

    // A folder page shows no tags: every link there is in that folder.
    await waitForHydration(page, '[data-cy="link-card"]');
    await expect(page.locator('[data-cy="folder-tag"]:visible, [data-cy="folder-badge"]:visible')).toHaveCount(0);
  });
});

test.describe("Layout saves", () => {
  test("a quick on-then-off saves in order, so the account ends on off", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    // The first save is slow: it would land after the second if both were
    // sent at once.
    const sent: unknown[] = [];
    let first = true;
    await page.route("**/api/user/layout", async (route) => {
      sent.push(route.request().postDataJSON().folderTags);
      if (first) {
        first = false;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Account menu" }).click();
    const toggle = page.getByRole("menuitemcheckbox", { name: "Folder tags" });
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    // One at a time: the second waits for the first.
    await expect.poll(() => sent).toEqual([true, false]);
    await page.waitForLoadState("networkidle");
    await page.unroute("**/api/user/layout");

    await page.reload();
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Folder tags" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  test("deleting a card from the keyboard moves focus to the next card", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await seed.link({ url: "https://bravo.example", title: "Bravo" });
    await openHome(page);
    await chooseView(page, "Grid");

    // Bravo (newest) first: delete it, by keyboard, from its menu.
    await card(page, "Bravo").hover();
    await card(page, "Bravo").getByRole("button", { name: "Open link menu" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    await expect(card(page, "Bravo")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
      .toBe("Alpha (opens in new tab)");
  });
});

test.describe("Folder tags on phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a row and a card show the folder's emoji on their favicon", async ({ page, seed }, testInfo) => {
    const folder = await seed.folder({ name: "Design Engineer", slug: "design", emoji: "🧑‍🎨" });
    await seed.link({ url: "https://alpha.example", title: "Alpha", folderId: folder });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.getByRole("button", { name: "Account menu" }).tap();
    await page.getByRole("menuitemcheckbox", { name: "Folder tags" }).tap();
    await page.keyboard.press("Escape");

    // A row: the emoji on the favicon's corner, nothing beside the title;
    // the name is the link's description.
    const row = page.locator('[data-cy="link-item"]').filter({ hasText: "Alpha" });
    await expect(row.locator('[data-cy="folder-badge"]')).toBeVisible();
    await expect(row.locator('[data-cy="folder-tag"]')).toHaveCount(0);
    await expect(row.getByRole("link", { name: /^Alpha/ })).toHaveAccessibleDescription(/In Design Engineer/);
    // No "Go to" button on touch: the ⋯ is always shown there.
    await expect(row.getByRole("link", { name: "Go to Design Engineer" })).toBeHidden();
    // The menu has it instead, first.
    await row.getByRole("button", { name: "Open link menu" }).tap();
    const goTo = page.getByRole("menuitem", { name: "Go to Design Engineer" });
    await expect(goTo).toHaveAttribute("href", "/folders/design");
    await expect(page.getByRole("menuitem").first()).toHaveText(/Go to Design Engineer/);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: testInfo.outputPath("tag-list.png") });

    // A card: the same badge on its favicon, no tag line; the name is the
    // link's description.
    await page.getByRole("button", { name: "Account menu" }).tap();
    await page.getByRole("menuitem", { name: "View mode" }).tap();
    await page.getByRole("menuitemradio", { name: "Grid" }).tap();
    await waitForHydration(page, '[data-cy="link-card"]');
    const alphaCard = card(page, "Alpha");
    await expect(alphaCard.locator('[data-cy="folder-badge"]')).toBeVisible();
    await expect(alphaCard.locator('[data-cy="folder-tag"]')).toHaveCount(0);
    await expect(alphaCard.getByRole("link", { name: /^Alpha/ })).toHaveAccessibleDescription(/In Design Engineer/);
    await page.screenshot({ path: testInfo.outputPath("tag-grid.png") });
  });

  test("the server's HTML already shows the badge, before any script runs", async ({ page, seed }) => {
    const folder = await seed.folder({ name: "Design Engineer", slug: "design", emoji: "🧑‍🎨" });
    await seed.link({ url: "https://alpha.example", title: "Alpha", folderId: folder });
    const saved = await page.request.patch("/api/user/layout", { data: { folderTags: true } });
    expect(saved.ok()).toBe(true);
    // No app scripts: what shows is the server's HTML and the CSS alone (the
    // row's tag must never depend on hydration).
    await page.route("**/*", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/home");
    const row = page.locator('[data-cy="link-item"]').filter({ hasText: "Alpha" });
    await expect(row.locator('[data-cy="folder-badge"]')).toBeVisible();
    await expect(row.locator('[data-cy="folder-tag"]')).toHaveCount(0);
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

