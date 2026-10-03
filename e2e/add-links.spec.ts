import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// "Add links" on a folder page: a popover with a search field and your 10
// most recent links not in the folder; picking one moves it in.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const popover = (page: Page) => page.getByRole("dialog", { name: /^Add links to/ });
const search = (page: Page) => popover(page).getByRole("combobox", { name: "Search your links" });
const option = (page: Page, title: string) => popover(page).getByRole("option", { name: new RegExp(title) });

async function openFolder(page: Page, slug: string) {
  await page.goto(`/folders/${slug}`);
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.waitForLoadState("networkidle");
}

async function seedSpaced(seed: { link: (l: { url: string; title: string; folderId?: string }) => Promise<string> }, links: { url: string; title: string; folderId?: string }[]) {
  for (const link of links) {
    await seed.link(link);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

test.use({ colorScheme: "dark" });

test.describe("Add links", () => {
  test("from the + menu: 10 most recent by default, check several, add them together", async ({ page, seed }, testInfo) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await seed.link({ url: "https://in-reading.example", title: "Already here", folderId: reading });
    await seedSpaced(seed, Array.from({ length: 12 }, (_, i) => ({
      url: `https://site${i}.example`,
      title: `Saved ${String(i).padStart(2, "0")}`,
    })));

    await openFolder(page, "reading");
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add links/ }).click();
    await expect(popover(page)).toBeVisible();
    await expect(search(page)).toBeFocused();

    // The 10 most recent, none from this folder.
    await expect(popover(page).getByRole("option")).toHaveCount(10);
    await expect(option(page, "Saved 11")).toBeVisible();
    await expect(option(page, "Saved 01")).toHaveCount(0);
    await expect(option(page, "Already here")).toHaveCount(0);
    // Clicking checks; checks survive a new search.
    await option(page, "Saved 11").click();
    await option(page, "Saved 10").click();
    await expect(option(page, "Saved 11")).toHaveAttribute("data-checked", "true");
    await search(page).fill("Saved 01");
    await expect(popover(page).getByRole("option")).toHaveCount(1);
    await option(page, "Saved 01").click();
    await page.screenshot({ path: testInfo.outputPath("add-links-popover.png") });
    await popover(page).getByRole("button", { name: /Add 3 links/ }).click();

    await expect(page.getByText("Moved 3 links to 📚 Reading")).toBeVisible();
    // Stays open for more, with nothing checked.
    await expect(popover(page)).toBeVisible();
    await expect(popover(page).getByRole("button", { name: /Add \d/ })).toHaveCount(0);
    await expect(rows(page)).toHaveCount(4);

    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeFocused();
  });

  test("the empty state's button and the A shortcut open it; Enter checks, Cmd/Ctrl+Enter adds", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    const work = await seed.folder({ name: "Work", slug: "work", emoji: "💼" });
    await seed.link({ url: "https://a.example", title: "Filed elsewhere", folderId: work });

    await openFolder(page, "reading");
    const empty = page.locator('[data-cy="link-group-empty"]');
    await expect(empty).toContainText("No links in this folder yet");
    await empty.getByRole("button", { name: /Add links/ }).click();
    await expect(popover(page)).toBeVisible();
    await expect(option(page, "Filed elsewhere")).toContainText("In Work");
    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);

    await page.keyboard.press("a");
    await expect(popover(page)).toBeVisible();
    await expect(option(page, "Filed elsewhere")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(option(page, "Filed elsewhere")).toHaveAttribute("data-checked", "true");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(rows(page)).toHaveCount(1);
    await expect(popover(page).getByText("Every link you’ve saved is already here.")).toBeVisible();

    await page.goto("/folders/work");
    // While streaming, a hidden copy can sit in the DOM: match the visible one.
    await expect(
      page.locator('[data-cy="link-group-empty"]').filter({ visible: true }),
    ).toBeVisible();
  });

  test("adding from the empty state keeps the picker open (under the + button)", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    await seed.link({ url: "https://a.example", title: "Alpha" });
    await seed.link({ url: "https://b.example", title: "Bravo" });

    await openFolder(page, "reading");
    await page
      .locator('[data-cy="link-group-empty"]')
      .filter({ visible: true })
      .getByRole("button", { name: /Add links/ })
      .click();
    await option(page, "Alpha").click();
    await popover(page).getByRole("button", { name: /Add 1 link/ }).click();
    await expect(rows(page)).toHaveCount(1);
    // The empty state (its anchor) is gone, but the picker stays open.
    await page.waitForTimeout(500);
    await expect(popover(page)).toBeVisible();
    await expect(option(page, "Bravo")).toBeVisible();
  });

  test("folder digits don't navigate away while the picker is open", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    await seed.folder({ name: "Work", slug: "work" });
    await seed.link({ url: "https://a.example", title: "Alpha" });

    await openFolder(page, "reading");
    await page.keyboard.press("a");
    await option(page, "Alpha").click();
    await popover(page).getByRole("button", { name: "Clear" }).focus();
    await page.keyboard.press("2");
    // Give a navigation time to start before checking it didn't.
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/folders\/reading$/);
    await expect(popover(page)).toBeVisible();
  });

  test("Home has no Add links", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label^="Folder:"]');
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Paste link" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Add links/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await expect(popover(page)).toHaveCount(0);
  });
});
