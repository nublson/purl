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

  test("a folder's search offers your other links, and adding one moves it here", async ({ page, seed }) => {
    const tools = await seed.folder({ name: "Dev Tools", slug: "dev-tools" });
    const reading = await seed.folder({ name: "Reading list", slug: "reading-list" });
    await seed.link({ url: "https://tools.example", title: "Some tool", folderId: tools });
    await seed.link({ url: "https://greptile.example", title: "AI code review agent", folderId: reading });
    await seed.link({ url: "https://unfiled.example", title: "Another AI code review" });
    await open(page, "/folders/dev-tools");

    await field(page).fill("ai code review");
    const section = page.locator('[data-cy="omnibox-add-section"]');
    await expect(section.getByRole("heading")).toHaveText(/Add to\s*.*Dev Tools/);
    const addRows = page.locator('[data-cy="omnibox-add-row"]');
    await expect(addRows).toHaveCount(2);
    // Nothing in the folder matches, but the other links are the answer.
    await expect(page.locator('[data-cy="link-group-empty"]')).toHaveCount(0);
    await expect(addRows.filter({ hasText: "AI code review agent" })).toContainText("Reading list");

    await page.getByRole("button", { name: "Add AI code review agent to Dev Tools (moves it from Reading list)" }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("AI code review agent");
    await expect(addRows).toHaveCount(1);
    await page.getByText("Undo").click();
    await expect(rows(page)).toHaveCount(0);
    await expect(addRows).toHaveCount(2);
  });

  test("the folder's Add section shows five, then Show more", async ({ page, seed }) => {
    await seed.folder({ name: "Dev Tools", slug: "dev-tools" });
    for (let i = 1; i <= 7; i++) {
      await seed.link({ url: `https://tool${i}.example`, title: `Tool ${i}` });
    }
    await open(page, "/folders/dev-tools");

    await field(page).fill("tool");
    const addRows = page.locator('[data-cy="omnibox-add-row"]');
    await expect(addRows).toHaveCount(5);
    await page.locator('[data-cy="omnibox-add-more"]').click();
    await expect(addRows).toHaveCount(7);
    await expect(page.locator('[data-cy="omnibox-add-more"]')).toHaveCount(0);
  });

  test("while a folder's search runs, one skeleton stands for the results and the Add section", async ({ page, seed }) => {
    await seed.folder({ name: "Dev Tools", slug: "dev-tools" });
    await seed.link({ url: "https://greptile.example", title: "AI code review agent" });
    await open(page, "/folders/dev-tools");
    // Hold the Add section's search, so the skeleton stays up.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/links/search?**", async (route) => {
      await held;
      await route.continue();
    });

    await field(page).fill("code review");
    await expect(page.getByRole("status").filter({ hasText: "Searching links" })).toBeAttached();
    // The search's answer isn't in yet: neither "no match" nor the old list.
    await expect(page.locator('[data-cy="link-group-empty"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search all links for “code review”" })).toBeVisible();

    release();
    await expect(page.locator('[data-cy="omnibox-add-row"]')).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "Searching links" })).toHaveCount(0);
  });

  test("refining a search keeps the previous results, stepped back, until the new ones land together", async ({ page, seed }) => {
    await seed.folder({ name: "Dev Tools", slug: "dev-tools" });
    await seed.link({ url: "https://greptile.example", title: "AI code review agent" });
    await seed.link({ url: "https://linter.example", title: "A code linter" });
    await open(page, "/folders/dev-tools");
    const addRows = page.locator('[data-cy="omnibox-add-row"]');

    await field(page).fill("code");
    await expect(addRows).toHaveCount(2);

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/links/search?**", async (route) => {
      await held;
      await route.continue();
    });
    await field(page).fill("code review");
    // The search is out (the list's own part may be back already): the
    // previous answer stays, dimmed, with its own Search all row.
    await expect(page.getByRole("button", { name: "Search all links for “code review”" })).toHaveCount(0);
    await expect(page.locator('[data-cy="omnibox-add-section"]').locator("xpath=ancestor::*[contains(@class,'opacity-60')]").first()).toBeAttached();
    await expect(addRows).toHaveCount(2);
    await expect(page.getByRole("status").filter({ hasText: "Searching links" })).toHaveCount(0);

    release();
    await expect(addRows).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Search all links for “code review”" })).toBeVisible();
  });

  test("in the grid view, the Add section and Search all keep the list's width", async ({ page, seed }) => {
    await seed.folder({ name: "Dev Tools", slug: "dev-tools" });
    await seed.link({ url: "https://greptile.example", title: "AI code review agent" });
    await page.setViewportSize({ width: 1280, height: 900 });
    expect((await page.request.patch("/api/user/layout", { data: { view: "grid" } })).ok()).toBe(true);
    await open(page, "/folders/dev-tools");

    await field(page).fill("code review");
    const section = page.locator('[data-cy="omnibox-add-section"]');
    await expect(section).toBeVisible();
    // The list's column: max-w-2xl (672px).
    expect((await section.boundingBox())!.width).toBeLessThanOrEqual(672);
    const searchAll = page.getByRole("button", { name: "Search all links for “code review”" });
    expect((await searchAll.boundingBox())!.width).toBeLessThanOrEqual(672);
  });

  test("a URL saved in another folder offers to move it here", async ({ page, seed }) => {
    await seed.folder({ name: "Dev Tools", slug: "dev-tools" });
    const reading = await seed.folder({ name: "Reading", slug: "reading" });
    await seed.link({ url: "https://example.com/post", title: "A post", folderId: reading });
    await open(page, "/folders/dev-tools");
    await field(page).fill("https://example.com/post");
    await expect(saveRow(page)).toHaveAccessibleName(/^Add .* to Dev Tools \(already saved\)$/, {
      timeout: 15_000,
    });
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
    // The band behind it is solid up to its top (then fades).
    const band = page.locator('form[role="search"]').locator("xpath=preceding-sibling::div[1]");
    expect(await band.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  });
});
