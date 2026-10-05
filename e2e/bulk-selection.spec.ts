import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The selection UI on Home: checkboxes, the floating bar, its Move menu
// (including "New folder…"), Delete with Undo, and the keyboard shortcuts.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const bar = (page: Page) => page.getByRole("toolbar", { name: "Selected links" });
const checkbox = (page: Page, title: string) =>
  page.getByRole("checkbox", { name: `Select ${title}` });

async function seedLinks(seed: { link: (l: { url: string; title: string; folderId?: string }) => Promise<string> }, titles: string[]) {
  // Seeded oldest first, so the list shows them newest first: reverse order.
  for (const title of titles) {
    await seed.link({ url: `https://${title.toLowerCase()}.example`, title });
    // Distinct creation times: rows with equal times can swap places
    // between reloads, which would move a Shift-click range.
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"]');
  await page.waitForLoadState("networkidle");
}

test.use({ colorScheme: "dark" });

test.describe("Link selection", () => {
  test("checking a row enters selection mode; rows toggle on click; Esc clears", async ({ page, seed }, testInfo) => {
    await seedLinks(seed, ["Alpha", "Bravo", "Charlie"]);
    await openHome(page);

    await expect(bar(page)).toHaveCount(0);
    await rows(page).first().hover();
    await checkbox(page, "Charlie").click();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText("1 selected");
    // Every row shows its checkbox, and row menus are gone.
    await expect(rows(page).getByRole("checkbox")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Open link menu" })).toHaveCount(0);

    // A click on the row toggles it instead of opening the link.
    const popup = page.waitForEvent("popup", { timeout: 1000 }).catch(() => null);
    await rows(page).nth(2).click();
    expect(await popup).toBeNull();
    await expect(bar(page)).toContainText("2 selected");

    await page.screenshot({ path: testInfo.outputPath("selection.png") });

    await page.keyboard.press("Escape");
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open link menu" }).first()).toBeAttached();
  });

  test("Shift-click selects a range; Select all checks and unchecks the list", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha", "Bravo", "Charlie", "Delta"]);
    await openHome(page);

    await rows(page).first().hover();
    await checkbox(page, "Delta").click();
    await rows(page).nth(2).click({ modifiers: ["Shift"] });
    await expect(bar(page)).toContainText("3 selected");

    const selectAll = bar(page).getByRole("checkbox", { name: "Select all" });
    await expect(selectAll).toHaveAttribute("aria-checked", "mixed");
    const width = (await selectAll.boundingBox())!.width;
    await selectAll.click();
    await expect(bar(page)).toContainText("4 selected");
    await expect(selectAll).toHaveAttribute("aria-checked", "true");
    // The label stays "Select all" (it's the visible name voice control
    // users say); the checked box shows the state, and the bar doesn't jump.
    await expect(selectAll).toContainText("Select all");
    expect((await selectAll.boundingBox())!.width).toBe(width);
    await selectAll.click();
    await expect(bar(page)).toHaveCount(0);
  });

  test("the bar is one Tab stop; arrows, Home and End move inside it", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await openHome(page);
    await rows(page).first().hover();
    await checkbox(page, "Alpha").click();
    const count = bar(page).getByRole("button", { name: "1 selected, clear selection" });
    await expect(count).toBeVisible();

    const tabStops = () =>
      bar(page).evaluate((el) =>
        [...el.querySelectorAll("button")].filter((b) => b.tabIndex === 0).length,
      );
    expect(await tabStops()).toBe(1);
    await expect(count).toHaveAttribute("tabindex", "0");

    await count.focus();
    await page.keyboard.press("ArrowRight");
    await expect(bar(page).getByRole("checkbox", { name: "Select all" })).toBeFocused();
    await page.keyboard.press("End");
    const del = bar(page).getByRole("button", { name: "Delete 1 link" });
    await expect(del).toBeFocused();
    // The last button used is the bar's Tab stop now.
    await expect(del).toHaveAttribute("tabindex", "0");
    expect(await tabStops()).toBe(1);
    await page.keyboard.press("Home");
    await expect(count).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(del).toBeFocused();
  });

  test("Tab leaves the bar in one press and comes back to the last button used", async ({ page, seed, browserName }) => {
    // WebKit skips buttons on Tab (Safari's default), so it can't reach the bar.
    test.skip(browserName === "webkit", "Tab skips buttons in WebKit");
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await openHome(page);
    await rows(page).first().hover();
    await checkbox(page, "Alpha").click();
    const count = bar(page).getByRole("button", { name: "1 selected, clear selection" });
    const inBar = () =>
      bar(page).evaluate((el) => el.contains(document.activeElement));

    await count.focus();
    await page.keyboard.press("Tab");
    expect(await inBar()).toBe(false);
    await page.keyboard.press("Shift+Tab");
    await expect(count).toBeFocused();

    // Move the stop with the arrows: Tab out, then back in, lands on Delete.
    await page.keyboard.press("End");
    const del = bar(page).getByRole("button", { name: "Delete 1 link" });
    await expect(del).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await inBar()).toBe(false);
    await page.keyboard.press("Tab");
    await expect(del).toBeFocused();
  });

  test("Move files the selection into a folder, with one Undo toast", async ({ page, seed }, testInfo) => {
    await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await openHome(page);

    await rows(page).first().hover();
    await checkbox(page, "Bravo").click();
    await rows(page).nth(1).click();
    await bar(page).getByRole("button", { name: "Move" }).click();
    await expect(page.getByRole("menuitem", { name: "New folder…" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("move-menu.png") });

    await page.getByRole("menuitem", { name: "Reading" }).click();
    await expect(page.getByText("Moved 2 links to 📚 Reading")).toBeVisible();
    await expect(bar(page)).toHaveCount(0);

    await page.goto("/folders/reading");
    await expect(rows(page)).toHaveCount(2);
  });

  test("New folder… creates a folder and moves the selection into it", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha"]);
    await openHome(page);

    await rows(page).first().hover();
    await checkbox(page, "Alpha").click();
    await page.keyboard.press("m");
    await page.getByRole("menuitem", { name: "New folder…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Folder name").fill("Later");
    await dialog.getByRole("button", { name: "Create folder" }).click();

    await expect(page.getByText(/Moved 1 link to .* Later/)).toBeVisible();
    // Stays on Home (no navigation to the new folder).
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/folders/later");
    await expect(rows(page)).toHaveCount(1);
  });

  test("Delete removes the selection with one Undo toast", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha", "Bravo", "Charlie"]);
    await openHome(page);

    await rows(page).first().hover();
    await checkbox(page, "Charlie").click();
    await rows(page).nth(1).click();
    await bar(page).getByRole("button", { name: "Delete 2 links" }).click();
    await expect(page.getByText("2 links deleted")).toBeVisible();
    await expect(rows(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rows(page)).toHaveCount(3);
  });
});

test.describe("Link selection on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the bar fits the screen", async ({ page, seed }, testInfo) => {
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await openHome(page);
    await rows(page).first().hover();
    await checkbox(page, "Bravo").click();
    await bar(page).getByRole("checkbox", { name: "Select all" }).click();
    await expect(bar(page)).toContainText("2 selected");

    const box = await bar(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(16);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 - 16);
    // Nothing spills out of the bar either.
    expect(
      await bar(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(bar(page).getByRole("button", { name: /Delete/ })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("phone.png") });
  });
});

test.describe("Link selection, after deselecting", () => {
  test("the row gets its favicon back and no menu button while not hovered", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await openHome(page);

    const row = rows(page).first();
    await row.hover();
    await checkbox(page, "Bravo").click();
    await checkbox(page, "Bravo").click();
    await expect(bar(page)).toHaveCount(0);
    // Pointer away: the checkbox keeps focus from the click, but that's not
    // keyboard focus, so the row looks as it did before.
    await page.mouse.move(0, 0);

    const favicon = row.locator("div.contents > *").first();
    await expect(favicon).toHaveCSS("opacity", "1");
    await expect(checkbox(page, "Bravo")).toHaveCSS("opacity", "0");
    // The menu button fades with its container.
    await expect(row.locator('[data-slot="item-actions"]')).toHaveCSS("opacity", "0");
  });

  test("keyboard focus still reveals the checkbox", async ({ page, seed, browserName }) => {
    // WebKit skips buttons on Tab (Safari's default), so it can't reach the checkbox.
    test.skip(browserName === "webkit", "Tab skips buttons in WebKit");
    await seedLinks(seed, ["Alpha"]);
    await openHome(page);

    await page.keyboard.press("Tab");
    // Tab to the row's checkbox (after the link).
    for (let i = 0; i < 10; i++) {
      if (await checkbox(page, "Alpha").evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(checkbox(page, "Alpha")).toBeFocused();
    await expect(checkbox(page, "Alpha")).toHaveCSS("opacity", "1");
    await expect(rows(page).first().locator("div.contents > *").first()).toHaveCSS("opacity", "0");
  });
});

test.describe("Link selection, row size", () => {
  test("rows keep their 48px height in selection mode", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await openHome(page);

    const heights = () =>
      rows(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    const before = await heights();
    expect(before).toEqual([48, 48]);

    await rows(page).first().hover();
    await checkbox(page, "Bravo").click();
    await expect(bar(page)).toBeVisible();
    expect(await heights()).toEqual(before);
  });
});

test.describe("Selection bar on touch screens", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test("tablet: every control is finger-sized (40px, 44px hit area)", async ({ page, seed }) => {
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.getByRole("checkbox", { name: /Select Alpha/ }).tap();
    await expect(bar(page)).toBeVisible();
    const sizes = await bar(page).evaluate((el) =>
      [...el.querySelectorAll("button")].map((b) => {
        const box = b.getBoundingClientRect();
        const hit = getComputedStyle(b, "::after");
        return { h: box.height, inset: hit.top };
      }),
    );
    for (const size of sizes) {
      expect(size.h).toBe(40);
      expect(size.inset).toBe("-2px");
    }
    // Labels stay at tablet width.
    await expect(bar(page)).toContainText("Select all");
    await expect(bar(page)).toContainText("Move");
  });

  test("the narrowest phones (320px): the bar fits, with the count and ✕ only", async ({ page, seed }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedLinks(seed, ["Alpha", "Bravo"]);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.getByRole("checkbox", { name: /Select Alpha/ }).tap();
    await expect(bar(page)).toBeVisible();
    const box = (await bar(page).boundingBox())!;
    // Inside the page's 16px margins, Delete included.
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(320 - 16);
    const del = (await bar(page).getByRole("button", { name: "Delete 1 link" }).boundingBox())!;
    expect(del.x + del.width).toBeLessThanOrEqual(box.x + box.width);
    const count = bar(page).getByRole("button", { name: "1 selected, clear selection" });
    // What's drawn (innerText skips the hidden word); the name keeps it.
    expect((await count.innerText()).trim()).toBe("1");
  });
});
