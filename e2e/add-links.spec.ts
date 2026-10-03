import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// "Add links" on a folder page: search your other links and move the
// picked ones into the folder.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const dialog = (page: Page) => page.getByRole("dialog", { name: "Add links" });

async function openFolder(page: Page, slug: string) {
  await page.goto(`/folders/${slug}`);
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.waitForLoadState("networkidle");
}

test.use({ colorScheme: "dark" });

test.describe("Add links", () => {
  test("from the empty state: search, pick, add", async ({ page, seed }, testInfo) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await seed.link({ url: "https://react.dev", title: "React docs" });
    await seed.link({ url: "https://vuejs.org", title: "Vue guide" });
    await seed.link({ url: "https://in-reading.example", title: "Already here", folderId: reading });

    await openFolder(page, "reading");
    await expect(rows(page)).toHaveCount(1);
    // Not empty: no empty state. Use the header menu instead.
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add links/ }).click();
    await expect(dialog(page)).toBeVisible();

    // Links already in this folder are left out.
    await expect(dialog(page).getByText("Already here")).toHaveCount(0);
    await expect(dialog(page).getByRole("checkbox")).toHaveCount(2);

    await dialog(page).getByRole("searchbox", { name: "Search your links" }).fill("react");
    await expect(dialog(page).getByRole("checkbox")).toHaveCount(1);
    await dialog(page).getByRole("checkbox", { name: "Add React docs" }).click();
    await page.screenshot({ path: testInfo.outputPath("add-links.png") });
    await dialog(page).getByRole("button", { name: "Add 1 link" }).click();

    await expect(page.getByText("Moved 1 link to 📚 Reading")).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
  });

  test("the empty state's button and the A shortcut open it; links in other folders say so", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading" });
    const work = await seed.folder({ name: "Work", slug: "work", emoji: "💼" });
    await seed.link({ url: "https://a.example", title: "Filed elsewhere", folderId: work });

    await openFolder(page, "reading");
    const empty = page.locator('[data-cy="link-group-empty"]');
    await expect(empty).toContainText("No links in this folder yet");
    await empty.getByRole("button", { name: /Add links/ }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("listitem").filter({ hasText: "Filed elsewhere" })).toContainText("Work");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    await page.keyboard.press("a");
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("checkbox", { name: "Add Filed elsewhere" }).click();
    await dialog(page).getByRole("button", { name: "Add 1 link" }).click();
    await expect(rows(page)).toHaveCount(1);

    await page.goto("/folders/work");
    await expect(page.locator('[data-cy="link-group-empty"]')).toBeVisible();
  });

  test("Home has no Add links", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label^="Folder:"]');
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Paste link" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Add links/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await expect(dialog(page)).toHaveCount(0);
  });
});
