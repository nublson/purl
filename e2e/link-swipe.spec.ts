import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Swipe actions on phones: right toggles read on release, left reveals
// Delete and Move. Real touches through the DevTools protocol (Chromium
// only), so touch-action and pointer capture behave as on a phone.

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "touch input via the DevTools protocol",
);

const row = (page: Page, title: string) =>
  page.locator('[data-cy="link-item"]').filter({ hasText: title });
const rowLink = (page: Page, title: string) =>
  row(page, title).locator("a[href]").first();

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"]');
  await page.waitForLoadState("networkidle");
}

/** Drags a finger across `target` from its middle by (dx, dy), in steps. */
async function swipe(page: Page, target: Locator, dx: number, dy = 0) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x, y }]);
  const steps = 12;
  for (let step = 1; step <= steps; step++) {
    await touch("touchMove", [
      { x: x + (dx * step) / steps, y: y + (dy * step) / steps },
    ]);
  }
  await touch("touchEnd", []);
  await cdp.detach();
}

async function expectRead(page: Page, title: string, read: boolean) {
  await expect(rowLink(page, title)).toHaveAttribute(
    "aria-label",
    `${title} (${read ? "read, " : ""}opens in new tab)`,
  );
}

test.describe("Link row swipe", () => {
  test("swiping right past the threshold toggles read, without opening the link", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    const popups: unknown[] = [];
    page.on("popup", (popup) => popups.push(popup));

    // Too short: springs back, nothing changes.
    await swipe(page, row(page, "Alpha"), 40);
    await page.waitForTimeout(400);
    await expectRead(page, "Alpha", false);

    await swipe(page, row(page, "Alpha"), 110);
    await expectRead(page, "Alpha", true);
    await swipe(page, row(page, "Alpha"), 110);
    await expectRead(page, "Alpha", false);
    expect(popups).toHaveLength(0);
  });

  test("swiping left reveals Delete and Move; a tap on the row closes it", async ({ page, seed }, testInfo) => {
    await seed.folder({ name: "Later", slug: "later", emoji: "⏳" });
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seed.link({ url: "https://bravo.example", title: "Bravo" });
    await openHome(page);
    const popups: unknown[] = [];
    page.on("popup", (popup) => popups.push(popup));

    await swipe(page, row(page, "Alpha"), -140);
    const deleteButton = page.getByRole("button", { name: "Delete", exact: true });
    const moveButton = page.getByRole("button", { name: "Move to folder" });
    await expect(deleteButton).toBeVisible();
    await expect(moveButton).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath("swipe-open.png") });

    // A tap on the row closes it instead of opening the link.
    await page.touchscreen.tap(30, (await row(page, "Alpha").boundingBox())!.y + 24);
    await expect(deleteButton).toHaveCount(0);
    expect(popups).toHaveLength(0);

    // Move: the folder list, then the toast.
    await swipe(page, row(page, "Alpha"), -140);
    await moveButton.tap();
    await page.getByRole("menuitem", { name: /Later/ }).tap();
    await expect(page.getByText(/Moved to .*Later/)).toBeVisible();

    // Delete: the row leaves with the usual Undo toast.
    await swipe(page, row(page, "Bravo"), -140);
    await deleteButton.tap();
    await expect(row(page, "Bravo")).toHaveCount(0);
    await expect(page.getByText("Link deleted")).toBeVisible();
  });

  test("a vertical drag scrolls instead of swiping", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    await swipe(page, row(page, "Alpha"), 8, -60);
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await expectRead(page, "Alpha", false);
  });

  test("the row menu opens its folders right under Move to folder", async ({ page, seed }, testInfo) => {
    await seed.folder({ name: "Later", slug: "later", emoji: "⏳" });
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);

    await row(page, "Alpha").getByRole("button", { name: "Open link menu" }).tap();
    const trigger = page.getByRole("menuitem", { name: "Move to folder" });
    await trigger.tap();
    const folder = page.getByRole("menuitem", { name: /Later/ });
    await expect(folder).toBeVisible();
    // Below its trigger, inside the same menu (not a side submenu).
    const triggerBox = (await trigger.boundingBox())!;
    const folderBox = (await folder.boundingBox())!;
    expect(folderBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1);
    expect(folderBox.x + folderBox.width).toBeLessThanOrEqual(390);
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

  test("a long-press that selects the row ends the swipe", async ({ page, seed }, testInfo) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    const box = (await row(page, "Alpha").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      points: { x: number; y: number }[],
    ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

    // A plain swipe in progress: the row is visibly held.
    await touch("touchStart", [{ x, y }]);
    for (let step = 1; step <= 6; step++) await touch("touchMove", [{ x: x - step * 8, y }]);
    await page.screenshot({ path: testInfo.outputPath("swipe-held.png") });
    await touch("touchEnd", []);
    await page.waitForTimeout(400);

    // Hold until the long-press selects the row, then drag sideways.
    await touch("touchStart", [{ x, y }]);
    await page.waitForTimeout(700);
    for (let step = 1; step <= 12; step++) await touch("touchMove", [{ x: x - step * 12, y }]);
    await touch("touchEnd", []);
    await cdp.detach();

    await expect(page.getByRole("toolbar", { name: "Selected links" })).toContainText("1 selected");
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    const offset = await row(page, "Alpha").evaluate(
      (el) => new DOMMatrix(getComputedStyle(el.parentElement!.parentElement!).transform).m41,
    );
    expect(offset).toBe(0);
  });
});
