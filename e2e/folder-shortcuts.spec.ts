import { expect, test, waitForHydration } from "./fixtures";

// Digit keys switch folders: 1 = Home, then 2–9 and 0 for folders in menu
// order (by name).

test.use({ colorScheme: "dark" });

test.describe("Folder shortcuts", () => {
  test("digits switch folders from anywhere, and the menu shows each key", async ({ page, seed }, testInfo) => {
    await seed.folder({ name: "Design", slug: "design", emoji: "🎨" });
    await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label^="Folder:"]');

    await page.keyboard.press("3");
    await expect(page).toHaveURL(/\/folders\/reading$/);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/folders\/design$/);
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/home$/);
    // No folder on 4 or 0 (only two folders): nothing happens.
    await page.keyboard.press("4");
    await page.keyboard.press("0");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/home$/);

    // In the menu: keys on every row but the current one (Home, checked).
    await page.getByRole("button", { name: "Folder: Home" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: /Design/ })).toHaveAttribute("aria-keyshortcuts", "2");
    await expect(menu.getByRole("menuitem", { name: /Reading/ })).toContainText("3");
    await page.screenshot({ path: testInfo.outputPath("folder-menu.png"), clip: { x: 0, y: 0, width: 400, height: 320 } });

    // Digits work with the menu open, and close it.
    await page.keyboard.press("3");
    await expect(page).toHaveURL(/\/folders\/reading$/);
    await expect(menu).toHaveCount(0);
  });

  test("digits typed into a field stay text", async ({ page, seed }) => {
    await seed.folder({ name: "Design", slug: "design" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label^="Folder:"]');

    await page.getByRole("button", { name: "Folder: Home" }).click();
    await page.getByRole("menuitem", { name: "New folder" }).click();
    await page.getByLabel("Folder name").fill("");
    await page.getByLabel("Folder name").pressSequentially("1");
    await expect(page.getByLabel("Folder name")).toHaveValue("1");
    await expect(page).toHaveURL(/\/home$/);
  });
});
