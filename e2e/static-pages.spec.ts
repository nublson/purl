import { STATIC_PAGES } from "../src/lib/static-pages";
import { expect, test } from "./fixtures";

// The Notion-backed static pages (/privacy, /terms, /docs/api, /docs/mcp):
// the header mark, title, "Updated" line and footer, for signed-out readers
// and signed-in ones. They read Notion, so they need its env.

test.skip(
  !process.env.NOTION_ACCESS_TOKEN,
  "Static pages read Notion; set NOTION_ACCESS_TOKEN in .env.local",
);

test.describe("Static pages (signed out)", () => {
  test.use({ signedIn: false });

  for (const { label, path } of STATIC_PAGES) {
    test(`${label} opens from the footer and shows the page frame`, async ({ page }) => {
      await page.goto("/");
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === path && r.request().resourceType() === "document",
      );
      await page
        .getByRole("contentinfo")
        .getByRole("link", { name: label, exact: true })
        .click();

      expect((await response).status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));

      await expect(page.getByRole("link", { name: "Purl, home" })).toHaveAttribute("href", "/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByText(/^Updated /)).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      // The footer marks the page you're on.
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(footer.locator('a[aria-current="page"]')).toHaveCount(1);
    });
  }

  test("doesn't scroll sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const { path } of STATIC_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, path).toBeLessThanOrEqual(375);
    }
  });
});

test.describe("Static pages (signed in)", () => {
  test("stay on the page, and the mark leads to Home", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy$/);

    await page.getByRole("link", { name: "Purl, home" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });
});
