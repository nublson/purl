import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Importing a bookmarks file from Settings → Import. The file is read in the
// browser and the links are saved without fetching their pages, so no network
// is needed. Fixtures are made-up bookmarks in each format's shape.

const FIXTURES = path.join(__dirname, "fixtures", "import");
const fixture = (name: string) => path.join(FIXTURES, name);

const cy = (page: Page, id: string) => page.locator(`[data-cy="${id}"]`);

/** Opens Settings on the Import tab through the `?settings=` deep link. */
async function openImportTab(page: Page) {
  await page.goto("/home?settings=import");
  await waitForHydration(page, '[data-cy="import-file-input"]');
}

async function expectFolderInMenu(page: Page, name: string) {
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.getByRole("button", { name: "Folder: Home" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: new RegExp(name) })).toBeVisible();
  await page.keyboard.press("Escape");
}

test.describe("Import", () => {
  test("a browser bookmarks file imports its links and folders", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("browser-bookmarks.html"));
    const preview = cy(page, "import-preview");
    await expect(preview).toContainText("links in");
    await expect(preview).toContainText("Browser bookmarks");
    // The bookmarklet isn't a web link.
    await expect(preview).toContainText("1 item isn’t a web link");
    // Focus moves to the preview's heading once the file is read.
    await expect(preview.getByRole("heading")).toBeFocused();

    await cy(page, "import-submit").click();
    const summary = cy(page, "import-summary");
    await expect(summary).toContainText("Imported 5 links");
    await expect(summary.getByRole("heading")).toBeFocused();

    await cy(page, "import-view-links").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const rows = page.locator('[data-cy="link-item"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: "Café tools & tips" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Dev notes, part one" })).toHaveCount(1);

    await expectFolderInMenu(page, "Dev / Tools");
  });

  test("a Raindrop backup keeps its nested folder, and importing it again skips everything", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("raindrop-backup.csv"));
    await expect(cy(page, "import-preview")).toContainText("Raindrop CSV");
    await cy(page, "import-submit").click();
    await expect(cy(page, "import-summary")).toContainText("Imported 4 links");

    // The same file again: every link is already saved.
    await page.getByRole("button", { name: "Import another file" }).click();
    await cy(page, "import-file-input").setInputFiles(fixture("raindrop-backup.csv"));
    await cy(page, "import-submit").click();
    await expect(cy(page, "import-summary")).toContainText("Nothing new to import");
    await expect(cy(page, "import-summary")).toContainText("All 4 links were already saved.");

    await cy(page, "import-view-links").click();
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(4);
    await expectFolderInMenu(page, "Design Engineer / Artists");
  });

  test("a Raindrop collection and a Pocket file have no folders, so links go to Home", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("raindrop-collection.csv"));
    await expect(cy(page, "import-preview")).toContainText("Raindrop CSV");
    await expect(cy(page, "import-preview")).toContainText("no folder information");

    // Choosing another file replaces the preview.
    await cy(page, "import-choose-another").click();
    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await expect(cy(page, "import-preview")).toContainText("Pocket CSV");
    await expect(cy(page, "import-preview")).toContainText("2 links");
    await cy(page, "import-submit").click();
    await expect(cy(page, "import-summary")).toContainText("Imported 2 links");
  });

  test("an unrecognized file shows an error and lets you choose another", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles({
      name: "notes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,age\nAda,36\n"),
    });
    const error = cy(page, "import-error");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toContainText("We couldn’t recognize this file.");

    await cy(page, "import-choose-another").click();
    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await expect(cy(page, "import-preview")).toContainText("Pocket CSV");
  });

  test("an import in progress shows its progress", async ({ page }) => {
    // Hold the request so the importing state can be seen.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/links/import", async (route) => {
      await held;
      await route.continue();
    });
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await cy(page, "import-submit").click();
    const progress = cy(page, "import-progress");
    await expect(progress.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "2");
    await expect(progress).toContainText("Importing 0 of 2");

    release();
    await expect(cy(page, "import-summary")).toContainText("Imported 2 links");
  });
});
