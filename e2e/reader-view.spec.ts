import type { Page } from "@playwright/test";
import { chooseView, expect, test, waitForHydration } from "./fixtures";
import { createTestUser, deleteTestUser } from "./support/db";
import { randomUUID } from "node:crypto";
import { sessionCookies } from "./support/auth";

// The reader view: a ready page pearl opens /read/<id> in the same tab, the
// link menu says how the view stands, the search reads inside it, and it
// never leaves the owner's account.

const MARKDOWN =
  "## Migration\n\nSwallows fly south.\n\n![A swallow](https://example.com/s.jpg)";

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const cards = (page: Page) => page.locator('[data-cy="link-card"]');

async function openMenu(page: Page) {
  await rows(page).first().hover();
  await page.getByRole("button", { name: "Open link menu" }).click();
}

test.describe("Reader view", () => {
  test("a ready row opens the reader view in the same tab", async ({ page, seed }) => {
    const id = await seed.link({ url: "https://example.com/birds", title: "Birds of passage" });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    await rows(page).first().getByRole("link", { name: /Birds of passage/ }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${id}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Birds of passage");
    await expect(page.getByRole("heading", { level: 2, name: "Migration" })).toBeVisible();
    await expect(page.getByText("Swallows fly south.")).toBeVisible();
    await expect(page.locator("main, body").first()).toContainText("Reader view from");
    // The image, or its alt text once it fails to load (no network).
    await expect(
      page.locator('img[alt="A swallow"]').or(page.getByText("A swallow", { exact: true })),
    ).not.toHaveCount(0);
    const original = page.getByRole("link", { name: "Open original" });
    await expect(original).toHaveAttribute("href", "https://example.com/birds");
    await expect(original).toHaveAttribute("target", "_blank");

    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("the grid card opens it too", async ({ page, seed }) => {
    const id = await seed.link({ url: "https://example.com/birds", title: "Birds of passage" });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    await page.goto("/home");
    await chooseView(page, "Grid");
    await expect(cards(page)).toHaveCount(1);
    await cards(page).first().getByRole("link", { name: /Birds of passage/ }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${id}$`));
    await expect(page.getByRole("heading", { level: 2, name: "Migration" })).toBeVisible();
  });

  test("a link without a view opens the original in a new tab and says it's being made", async ({
    page,
    seed,
  }) => {
    await seed.link({ url: "https://example.com/plain", title: "Plain page" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');
    await expect(
      rows(page).first().getByRole("link", { name: /Plain page/ }),
    ).toHaveAttribute("target", "_blank");

    await openMenu(page);
    await expect(page.locator('[data-cy="reader-view-state"]')).toHaveText(
      "Making the reader view…",
    );
  });

  test("the menu says why there is no view, and Try again clears a failed one", async ({
    page,
    seed,
  }) => {
    const none = await seed.link({ url: "https://example.com/none", title: "None page" });
    await seed.readerView(none, { status: "NONE", reason: "no_article" });
    const failed = await seed.link({ url: "https://example.com/failed", title: "Failed page" });
    await seed.readerView(failed, { status: "FAILED", reason: "timeout" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    const row = (title: string) => rows(page).filter({ hasText: title });
    await row("None page").hover();
    await row("None page").getByRole("button", { name: "Open link menu" }).click();
    await expect(page.locator('[data-cy="reader-view-state"]')).toHaveText(
      "No article to read on this page.",
    );
    await expect(page.locator('[data-cy="reader-view-retry"]')).toHaveCount(0);
    await page.keyboard.press("Escape");

    await row("Failed page").hover();
    await row("Failed page").getByRole("button", { name: "Open link menu" }).click();
    await expect(page.locator('[data-cy="reader-view-state"]')).toHaveText(
      "Couldn't make a reader view: it took too long.",
    );
    const retried = page.waitForResponse(
      (res) => res.url().includes(`/api/links/${failed}/reader-view/retry`),
    );
    await page.locator('[data-cy="reader-view-retry"]').click();
    expect((await retried).ok()).toBe(true);
    await expect(page.locator('[data-cy="reader-view-state"]')).toHaveText(
      "Making the reader view…",
    );
    await expect(page.locator('[data-cy="reader-view-retry"]')).toHaveCount(0);
  });

  test("retrying a ready view is refused", async ({ page, seed }) => {
    const id = await seed.link({ url: "https://example.com/birds", title: "Birds" });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    await page.goto("/home");
    const response = await page.request.post(`/api/links/${id}/reader-view/retry`);
    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("NOT_FAILED");
  });

  test("search finds words inside the reader view, by prefix", async ({ page, seed }) => {
    const id = await seed.link({ url: "https://example.com/birds", title: "Birds of passage" });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    await seed.link({ url: "https://example.org/other", title: "Other" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    const search = page.getByRole("searchbox", { name: /Search your links/ });
    await search.fill("swal");
    await expect(rows(page).filter({ hasText: "Birds of passage" })).toBeVisible();
    await expect(rows(page).filter({ hasText: "Other" })).toHaveCount(0);
  });

  test("another user's read page is a 404", async ({ page, seed, baseURL }) => {
    const id = await seed.link({ url: "https://example.com/birds", title: "Birds of passage" });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    const other = await createTestUser(`e2e-other-${randomUUID().slice(0, 8)}@purl.test`, "Other");
    try {
      await page.context().clearCookies();
      await page.context().addCookies(await sessionCookies(other.id, baseURL!));
      const response = await page.goto(`/read/${id}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Swallows fly south.")).toHaveCount(0);
    } finally {
      await deleteTestUser(other.id);
    }
  });

  test("the cron guard", async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set");
    const wrong = await request.get("/api/cron/reader-views", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(wrong.status()).toBe(401);
    const right = await request.get("/api/cron/reader-views", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      timeout: 120_000,
    });
    expect(right.status()).toBe(200);
    const body = await right.json();
    for (const key of ["claimed", "ready", "none", "failed"]) {
      expect(typeof body[key]).toBe("number");
    }
  });
});

test.describe("Reader view, signed out", () => {
  test.use({ signedIn: false });

  test("the read page redirects home", async ({ page, seed }) => {
    const id = await seed.link({ url: "https://example.com/birds", title: "Birds of passage" });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    await page.goto(`/read/${id}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Swallows fly south.")).toHaveCount(0);
  });

  test("the shared page links to the original and carries no reader view", async ({
    page,
    seed,
    testUser,
  }) => {
    const folder = await seed.folder({ name: "Shared", slug: "shared", isPublic: true });
    const id = await seed.link({
      url: "https://example.com/birds",
      title: "Birds of passage",
      folderId: folder,
    });
    await seed.readerView(id, { status: "READY", markdown: MARKDOWN });
    await page.goto(`/@${testUser.username}/shared`);
    await expect(page.getByRole("link", { name: /Birds of passage/ })).toHaveAttribute(
      "href",
      "https://example.com/birds",
    );
    expect(await page.content()).not.toContain("Swallows fly south");
  });
});
