import { expect, test } from "./fixtures";

const TEST_URL = "https://nublson.com";

test.describe("Link saving — core journey", () => {
  test("a seeded link renders in the list on /home", async ({ page, seed }) => {
    await seed.link({ url: TEST_URL });

    await page.goto("/home");
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(1);
  });

  test("an invalid URL is rejected by the API with an error", async ({ page }) => {
    // The route validates the URL before any outbound fetch.
    const response = await page.request.post("/api/links", {
      data: { url: "not-a-url" },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });

  test("a saved link persists across visits", async ({ page, seed }) => {
    await seed.link({ url: TEST_URL });

    await page.goto("/home");
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(1);

    // Re-visit to confirm it's stored, not just held in memory.
    await page.reload();
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(1);
  });
});

test.describe("Signed out", () => {
  test.use({ signedIn: false });

  test("visiting /home sends you to the landing page", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL("/");
  });
});
