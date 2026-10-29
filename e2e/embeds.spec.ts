import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Show live goes through the real PATCH route, which checks the site's
// framing headers over the network (example.com allows it, github.com
// sends X-Frame-Options: deny), so these need network access.

async function openMenu(page: Page, title: string) {
  const row = page.locator('[data-cy="link-item"]', { hasText: title });
  await row.hover();
  await row.getByRole("button", { name: "Open link menu" }).click();
}

test.describe("Show live", () => {
  test("switches a frameable page live and keeps it on", async ({ page, seed }) => {
    await seed.link({ url: "https://example.com", title: "Example" });
    await page.goto("/home");
    await waitForHydration(page, '[aria-label="Open link menu"]');
    await openMenu(page, "Example");
    const item = page.getByRole("menuitemcheckbox", { name: "Show live" });
    await expect(item).toHaveAttribute("aria-checked", "false");
    const saved = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes("/api/links/"),
    );
    await item.click();
    expect((await saved).status()).toBe(200);
    await expect(item).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await waitForHydration(page, '[aria-label="Open link menu"]');
    await openMenu(page, "Example");
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Show live" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("refuses a site that doesn't allow framing", async ({ page, seed }) => {
    await seed.link({ url: "https://github.com", title: "GitHub" });
    await page.goto("/home");
    await waitForHydration(page, '[aria-label="Open link menu"]');
    await openMenu(page, "GitHub");
    const item = page.getByRole("menuitemcheckbox", { name: "Show live" });
    await item.click();
    await expect(
      page.getByText("This site doesn't allow being shown live"),
    ).toBeVisible();
    await expect(item).toHaveAttribute("aria-checked", "false");
  });

  test("an image link has no Show live", async ({ page, seed }) => {
    await seed.link({
      url: "https://example.com/pic.png",
      title: "Pic",
      contentType: "IMAGE",
    });
    await page.goto("/home");
    await waitForHydration(page, '[aria-label="Open link menu"]');
    await openMenu(page, "Pic");
    await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Show live" }),
    ).toHaveCount(0);
  });
});
