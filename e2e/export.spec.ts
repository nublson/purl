import { readFileSync } from "node:fs";
import { expect, test, waitForHydration } from "./fixtures";

// Exporting every link as a bookmarks file from Settings → Import & export.
// The file is built from the database alone, so no network is needed.

test.describe("export", () => {
  test("downloads a bookmarks file with the folders and links", async ({
    page,
    seed,
  }) => {
    const folderId = await seed.folder({ name: "Reading", slug: "reading" });
    await seed.link({
      url: "https://example.com/filed?a=1&b=2",
      title: "Filed <link>",
      description: "A description",
      folderId,
    });
    await seed.link({ url: "https://example.com/unfiled", title: "Unfiled" });

    await page.goto("/home?settings=import");
    await waitForHydration(page, '[data-cy="export-download"]');

    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-cy="export-download"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^purl-bookmarks-\d{4}-\d{2}-\d{2}\.html$/,
    );
    const path = await download.path();
    const html = readFileSync(path, "utf8");

    expect(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    expect(html).toContain(">Reading</H3>");
    expect(html).toContain(
      '<A HREF="https://example.com/filed?a=1&amp;b=2" ADD_DATE="',
    );
    expect(html).toContain(">Filed &lt;link&gt;</A>");
    expect(html).toContain("<DD>A description");
    expect(html).toContain('<A HREF="https://example.com/unfiled" ADD_DATE="');
    // The filed link sits inside the folder, the unfiled one after it.
    expect(html.indexOf("Reading</H3>")).toBeLessThan(html.indexOf("/filed"));
    expect(html.indexOf("</DL>")).toBeLessThan(html.indexOf("/unfiled"));
  });
});

test.describe("export, signed out", () => {
  test.use({ signedIn: false });

  test("answers 401", async ({ page }) => {
    const response = await page.request.get("/api/links/export");
    expect(response.status()).toBe(401);
  });
});
