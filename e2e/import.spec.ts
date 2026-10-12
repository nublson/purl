import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import { pool } from "./support/db";

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

/**
 * Drops `fixtureName` on the element matching `selector` the way a drag from
 * the desktop would (dragenter, dragover, drop). Returns whether the page let
 * the drop through: `false` means it was cancelled, so the browser won't open
 * the file and leave the app.
 */
async function dropFile(page: Page, selector: string, fixtureName: string) {
  const text = readFileSync(fixture(fixtureName), "utf8");
  return page.evaluate(
    ({ selector, name, text }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type: "text/csv" }));
      const target = document.querySelector(selector);
      if (!target) throw new Error(`No element matches ${selector}`);
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer };
      target.dispatchEvent(new DragEvent("dragenter", init));
      target.dispatchEvent(new DragEvent("dragover", init));
      return target.dispatchEvent(new DragEvent("drop", init));
    },
    { selector, name: fixtureName, text },
  );
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
  test("a file with unknown headers or no bookmarks is not recognized", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles({
      name: "people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,email\nAda,ada@example.com\n"),
    });
    await expect(cy(page, "import-error")).toContainText(
      "We couldn’t recognize this file. Use a bookmarks export from your browser, or a CSV from Raindrop or Pocket.",
    );

    await cy(page, "import-choose-another").click();
    await cy(page, "import-file-input").setInputFiles({
      name: "page.html",
      mimeType: "text/html",
      buffer: Buffer.from("<html><body><p>Just a page, no bookmarks.</p></body></html>"),
    });
    await expect(cy(page, "import-error")).toContainText("We couldn’t recognize this file.");
  });

  test("a single-collection Raindrop export previews that links go to Home", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("raindrop-collection.csv"));
    await expect(cy(page, "import-preview")).toContainText(
      "This file has no folder information, so links go to Home.",
    );
  });

  test("clicking Import twice quickly imports each link once", async ({ page, testUser }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("raindrop-backup.csv"));
    await expect(cy(page, "import-preview")).toBeVisible();
    // Two clicks in the same frame, before React has re-rendered.
    await cy(page, "import-submit").evaluate((button: HTMLElement) => {
      button.click();
      button.click();
    });
    await expect(cy(page, "import-summary")).toContainText("Imported 4 links");

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM "links" WHERE "userId" = $1`,
      [testUser.id],
    );
    expect(Number(rows[0].count)).toBe(4);
  });

  test("imported links appear under their original dates, not Today", async ({ page }) => {
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await cy(page, "import-submit").click();
    await expect(cy(page, "import-summary")).toContainText("Imported 2 links");
    await cy(page, "import-view-links").click();

    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "September 2025" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "August 2025" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today" })).toHaveCount(0);
  });

  test("a file over 5 MB is refused without sending anything", async ({ page }) => {
    let sent = 0;
    await page.route("**/api/links/import", async (route) => {
      sent += 1;
      await route.continue();
    });
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles({
      name: "huge.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, "a"),
    });
    await expect(cy(page, "import-error")).toContainText(
      "This file is over 5 MB. Export fewer bookmarks and try again.",
    );
    expect(sent).toBe(0);
  });

  test("a failed request shows the error, and Try again finishes the import", async ({ page }) => {
    const failing = (route: import("@playwright/test").Route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "The import service is down." }),
      });
    await page.route("**/api/links/import", failing);
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await cy(page, "import-submit").click();
    const error = cy(page, "import-error");
    await expect(error).toContainText("The import service is down.");
    await expect(cy(page, "import-retry")).toHaveText("Try again");

    await page.unroute("**/api/links/import", failing);
    await cy(page, "import-retry").click();
    await expect(cy(page, "import-summary")).toContainText("Imported 2 links");
  });

  test("the cron job fills in imported links without touching their titles or dates", async ({
    page,
    request,
    testUser,
  }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set");
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await cy(page, "import-submit").click();
    await expect(cy(page, "import-summary")).toContainText("Imported 2 links");

    type Row = { title: string; needsMetadata: boolean; createdAt: Date };
    const load = async () =>
      (
        await pool.query<Row>(
          `SELECT "title", "needsMetadata", "createdAt" FROM "links" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
          [testUser.id],
        )
      ).rows;

    const before = await load();
    expect(before.map((row) => row.needsMetadata)).toEqual([true, true]);

    // Each run claims the newest 20 flagged links of every user, so other
    // workers' imports can come first: run it until ours are claimed.
    await expect
      .poll(
        async () => {
          const response = await request.get("/api/cron/enrich-links", {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          });
          expect(response.status()).toBe(200);
          return (await load()).every((row) => !row.needsMetadata);
        },
        { timeout: 60_000 },
      )
      .toBe(true);

    const after = await load();
    expect(after.map((row) => row.title)).toEqual(before.map((row) => row.title));
    expect(after.map((row) => row.createdAt.getTime())).toEqual(
      before.map((row) => row.createdAt.getTime()),
    );
  });

  test("a file whose newest links are already saved still imports its new ones when room is short", async ({
    page,
    testUser,
  }) => {
    // 999 links, one of them the Pocket file's newest: room for 1 more. The
    // whole file is sent; the server skips the saved one, then keeps the other.
    await pool.query(
      `INSERT INTO "links" ("id", "url", "title", "favicon", "domain", "userId")
       SELECT 'e2e-fill-' || $1 || '-' || n, 'https://filler.example/' || n, 'Filler ' || n,
              'https://filler.example/favicon.ico', 'filler.example', $1
       FROM generate_series(1, 998) AS n`,
      [testUser.id],
    );
    await pool.query(
      `INSERT INTO "links" ("id", "url", "title", "favicon", "domain", "userId")
       VALUES ('e2e-saved-' || $1, 'https://example.com/pocket/mornings', 'Mornings',
               'https://example.com/favicon.ico', 'example.com', $1)`,
      [testUser.id],
    );
    await openImportTab(page);

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await expect(cy(page, "import-preview")).toContainText(
      "You have room for 1 more link. The newest are imported first, and links you already have don’t count.",
    );
    await cy(page, "import-submit").click();
    const summary = cy(page, "import-summary");
    await expect(summary).toContainText("Imported 1 link");
    await expect(summary).toContainText("1 was already saved and was skipped.");
    await expect(summary).not.toContainText("link limit");
  });

  test("dropping a file on the preview replaces it without leaving the app", async ({ page }) => {
    await openImportTab(page);
    const url = page.url();

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await expect(cy(page, "import-preview")).toContainText("Pocket CSV");

    expect(await dropFile(page, '[data-cy="import-preview"]', "raindrop-collection.csv")).toBe(false);
    await expect(cy(page, "import-preview")).toContainText("Raindrop CSV");
    await expect(cy(page, "import-preview")).not.toContainText("Pocket CSV");
    expect(page.url()).toBe(url);
  });

  test("a file dropped while importing is ignored and never leaves the app", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/links/import", async (route) => {
      await held;
      await route.continue();
    });
    await openImportTab(page);
    const url = page.url();

    await cy(page, "import-file-input").setInputFiles(fixture("pocket.csv"));
    await cy(page, "import-submit").click();
    await expect(cy(page, "import-progress")).toContainText("Importing 0 of 2");

    // Outside the tab's content (the page behind the dialog) and on it.
    expect(await dropFile(page, "body", "raindrop-collection.csv")).toBe(false);
    expect(await dropFile(page, '[data-cy="import-progress"]', "raindrop-collection.csv")).toBe(false);
    await expect(cy(page, "import-progress")).toContainText("Importing 0 of 2");
    expect(page.url()).toBe(url);

    release();
    await expect(cy(page, "import-summary")).toContainText("Imported 2 links");
  });
});
