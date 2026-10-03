import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The search field at the bottom of Home and folder pages: words filter the
// list; a URL also offers to save it.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const field = (page: Page) =>
  page.getByRole("searchbox", { name: "Search your links or paste a link to save" });
const saveRow = (page: Page) => page.locator('[data-cy="omnibox-save-row"]');
const saveButton = saveRow;

async function open(page: Page, path: string) {
  await page.goto(path);
  await waitForHydration(page, 'form[role="search"] input');
  await page.waitForLoadState("networkidle");
}

test.use({ colorScheme: "dark" });

test.describe("Search field", () => {
  test("words filter the list by title, domain or URL; clearing brings it back", async ({ page, seed }) => {
    await seed.link({ url: "https://react.dev/learn", title: "Learn React" });
    await seed.link({ url: "https://vuejs.org", title: "Vue guide" });
    await seed.link({ url: "https://example.com/my-blog", title: "Notes" });
    await open(page, "/home");
    await expect(rows(page)).toHaveCount(3);

    await field(page).fill("react");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Learn React");
    // Words aren't a URL: no Save row.
    await expect(saveRow(page)).toHaveCount(0);

    await field(page).fill("blog");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Notes");

    await field(page).fill("nothing like this");
    await expect(page.getByText("No links match “nothing like this”")).toBeVisible();

    await field(page).press("Escape");
    await expect(field(page)).toHaveValue("");
    await expect(rows(page)).toHaveCount(3);
  });

  test("a URL shows Save above the matches; Enter saves it and clears the field", async ({ page, seed }, testInfo) => {
    await seed.link({ url: "https://www.iana.org/help", title: "IANA help" });
    await open(page, "/home");

    await field(page).fill("iana.org");
    await expect(saveRow(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("omnibox-save.png") });

    await field(page).fill("example.com");
    // The row shows the page's title once its preview loads.
    await expect(saveButton(page)).toHaveAccessibleName("Save Example Domain", { timeout: 15_000 });
    await expect(saveRow(page)).toContainText("example.com");
    await page.screenshot({ path: testInfo.outputPath("omnibox-preview.png") });
    await field(page).press("Enter");
    await expect(field(page)).toHaveValue("");
    await expect(rows(page).filter({ hasText: "example.com" })).toHaveCount(1, { timeout: 20_000 });
    await expect(rows(page)).toHaveCount(2);
  });

  test("an exact URL that's saved says so", async ({ page, seed }) => {
    await seed.link({ url: "https://example.com/post", title: "A post" });
    await open(page, "/home");
    await field(page).fill("https://example.com/post");
    await expect(saveRow(page)).toContainText("Already saved");
    // A click anywhere on the row saves (here: refreshes the saved link).
    await saveRow(page).click({ position: { x: 200, y: 24 } });
    await expect(field(page)).toHaveValue("");
    await expect(rows(page)).toHaveCount(1, { timeout: 20_000 });
  });

  test("a URL saved outside the list on screen still says Already saved", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    const work = await seed.folder({ name: "Work", slug: "work" });
    await seed.link({ url: "https://example.com/post", title: "A post", folderId: work });
    await open(page, "/folders/reading");
    await field(page).fill("https://example.com/post");
    // Not in this folder's list; the server's answer arrives with the preview.
    await expect(saveRow(page)).toContainText("Already saved", { timeout: 15_000 });
  });

  test("a folder searches itself, and Search all links widens it", async ({ page, seed }) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading" });
    await seed.link({ url: "https://react.dev", title: "React in Reading", folderId: reading });
    await seed.link({ url: "https://react.example", title: "React elsewhere" });
    await open(page, "/folders/reading");

    await expect(field(page)).toHaveAttribute("placeholder", "Search Reading or paste a link");
    await field(page).fill("react");
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Search all links for “react”" }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(field(page)).toHaveValue("react");
    await expect(rows(page)).toHaveCount(2);
  });

  test("/ focuses the field, and the selection bar sits above it", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await open(page, "/home");

    await page.keyboard.press("/");
    await expect(field(page)).toBeFocused();
    await field(page).press("Escape");
    await field(page).press("Escape");
    await expect(field(page)).not.toBeFocused();

    await rows(page).first().hover();
    await page.getByRole("checkbox", { name: "Select Alpha" }).click();
    const bar = await page.getByRole("toolbar", { name: "Selected links" }).boundingBox();
    const box = await page.locator('form[role="search"]').boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(box!.y);
  });
});

test.describe("Search field, keyboard order", () => {
  test("Tab follows the screen: header, links, then the search field", async ({ page, seed, browserName }) => {
    // WebKit skips buttons on Tab (Safari's default), so the order can't be read there.
    test.skip(browserName === "webkit", "Tab skips buttons in WebKit");
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await open(page, "/home");

    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute("aria-label") ?? el?.tagName.toLowerCase() ?? "";
        }),
      );
    }
    const at = (name: string) => order.indexOf(name);
    expect(at("Account menu")).toBeGreaterThanOrEqual(0);
    expect(at("Alpha (opens in new tab)")).toBeGreaterThan(at("Account menu"));
    expect(at("Search your links or paste a link to save")).toBeGreaterThan(
      at("Open link menu"),
    );
  });
});

test.describe("Search field on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("sits at the bottom, inside the screen", async ({ page, seed }) => {
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await open(page, "/home");
    const box = (await page.locator('form[role="search"]').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(375 - 16);
    expect(box.y + box.height).toBeLessThanOrEqual(812 - 16);
    expect(box.y).toBeGreaterThan(700);
  });
});
