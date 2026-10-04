import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Reading state: opening a link marks it read (its row fades back), the row
// menu toggles it, and the selection bar marks many at once (R).

const row = (page: Page, title: string) =>
  page.locator('[data-cy="link-item"]').filter({ hasText: title });
const rowLink = (page: Page, title: string) =>
  row(page, title).locator("a[href]").first();

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"]');
  await page.waitForLoadState("networkidle");
}

/** Resolves when the server has answered a request marking links `read`. */
function readSaved(page: Page, read: boolean) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/links/") &&
      res.request().method() === "PATCH" &&
      res.request().postDataJSON()?.read === read,
  );
}

async function expectRead(page: Page, title: string, read: boolean) {
  await expect(rowLink(page, title)).toHaveAttribute(
    "aria-label",
    `${title} (${read ? "read, " : ""}opens in new tab)`,
  );
}

test.describe("Reading state", () => {
  test("opening a link marks it read, and it stays read after a reload", async ({ page, seed }, testInfo) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seed.link({ url: "https://bravo.example", title: "Bravo", read: true });
    await openHome(page);

    await expectRead(page, "Alpha", false);
    await expectRead(page, "Bravo", true);

    // The new tab is blocked from loading anything: only the click matters.
    await page.context().route("https://alpha.example/**", (route) => route.abort());
    const saved = page.waitForResponse(
      (res) => res.url().includes("/api/links/") && res.request().method() === "PATCH",
    );
    const popup = page.waitForEvent("popup");
    await rowLink(page, "Alpha").click();
    await (await popup).close();
    expect((await saved).ok()).toBe(true);
    await expectRead(page, "Alpha", true);

    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath("read-rows.png") });

    await page.reload();
    await waitForHydration(page, '[data-cy="link-item"]');
    await expectRead(page, "Alpha", true);
  });

  test("the row menu marks a link unread and read again", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha", read: true });
    await openHome(page);

    await row(page, "Alpha").hover();
    await row(page, "Alpha").getByRole("button", { name: "Open link menu" }).click();
    const unread = readSaved(page, false);
    await page.getByRole("menuitem", { name: "Mark as unread" }).click();
    await expectRead(page, "Alpha", false);
    expect((await unread).ok()).toBe(true);

    await row(page, "Alpha").hover();
    await row(page, "Alpha").getByRole("button", { name: "Open link menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Mark as read" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await waitForHydration(page, '[data-cy="link-item"]');
    await expectRead(page, "Alpha", false);
  });

  test("the selection bar marks the selection read, then unread with R", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seed.link({ url: "https://bravo.example", title: "Bravo", read: true });
    await openHome(page);

    await row(page, "Alpha").hover();
    await page.getByRole("checkbox", { name: "Select Alpha" }).click();
    await row(page, "Bravo").click();
    const bar = page.getByRole("toolbar", { name: "Selected links" });
    await expect(bar).toContainText("2 selected");

    // Not all read: the bar offers Mark as read.
    await bar.getByRole("button", { name: "Mark 2 links as read" }).click();
    await expectRead(page, "Alpha", true);
    await expectRead(page, "Bravo", true);
    // The selection stays, and the action flips.
    await expect(bar.getByRole("button", { name: "Mark 2 links as unread" })).toBeVisible();

    const unread = readSaved(page, false);
    await page.keyboard.press("r");
    await expectRead(page, "Alpha", false);
    await expectRead(page, "Bravo", false);
    // Sent after the read request (one at a time), so it lands last.
    expect((await unread).ok()).toBe(true);

    await page.keyboard.press("Escape");
    await page.reload();
    await waitForHydration(page, '[data-cy="link-item"]');
    await expectRead(page, "Alpha", false);
    await expectRead(page, "Bravo", false);
  });
});
