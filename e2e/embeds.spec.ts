import type { Page } from "@playwright/test";
import { chooseView, expect, test, waitForHydration } from "./fixtures";

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

// Live grid cards: rows seeded with embed on, the framed page served in the
// browser (page.route), so no network.

const LIVE_PAGE = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center">
<button onclick="document.body.dataset.clicked = '1'">Inside</button>
</body></html>`;

/** Serves https://live.example/* with a small page holding an "Inside" button. */
async function serveLivePage(page: Page) {
  await page.route("https://live.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: LIVE_PAGE }),
  );
}

const liveCard = (page: Page, title: string) =>
  page.locator('[data-cy="link-card"]').filter({ hasText: title });

async function openGrid(page: Page, { tap = false } = {}) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"], [data-cy="link-card"]');
  await chooseView(page, "Grid", { tap });
  await waitForHydration(page, '[data-cy="link-card"]');
}

test.describe("Live grid cards", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("a square face that shows the page, takes the wheel, and is interactive on click", async ({
    page,
    seed,
  }) => {
    await serveLivePage(page);
    for (let i = 0; i < 12; i++) {
      await seed.link({ url: `https://filler${i}.example`, title: `Filler ${i}` });
    }
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await openGrid(page);

    const card = liveCard(page, "Live demo");
    const face = card.locator('[data-face="embed"]');
    const box = await face.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(2);

    const frame = card.locator('iframe[title="Live demo"]');
    await expect(frame).toHaveAttribute("data-state", "loaded");
    await expect(frame).toHaveAttribute("sandbox", /allow-scripts/);
    await expect(frame).not.toHaveAttribute("sandbox", /allow-top-navigation/);

    // The cover takes the wheel: the page scrolls, not the frame.
    const cover = card.getByRole("button", { name: "Interact with Live demo" });
    await cover.hover();
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => page.locator("main").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await page.locator("main").evaluate((el) => (el.scrollTop = 0));

    // A click makes it active: the ring, no cover, the page takes the pointer.
    await cover.click();
    await expect(face).toHaveAttribute("data-active", "true");
    await expect(card.getByText("Esc to leave")).toBeVisible();
    await expect(cover).toBeHidden();
    // Esc (focus is in Purl) gives the cover back.
    await page.keyboard.press("Escape");
    await expect(cover).toBeVisible();
    await expect(face).not.toHaveAttribute("data-active", "true");

    await cover.click();
    const inside = page.frameLocator('iframe[title="Live demo"]');
    await inside.getByRole("button", { name: "Inside" }).click();
    await expect(inside.locator('body[data-clicked="1"]')).toHaveCount(1);
    // A press outside the card leaves it.
    await page.getByRole("heading", { name: "Today" }).click();
    await expect(cover).toBeVisible();
  });

  test("the title strip and Open large open the viewer", async ({ page, seed }) => {
    await serveLivePage(page);
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await openGrid(page);

    const card = liveCard(page, "Live demo");
    const box = (await card.boundingBox())!;
    // The strip under the square.
    await card.click({ position: { x: 24, y: box.height - 16 } });
    // The viewer draws nothing for a live page yet: it opens, named by the
    // title, on this pearl.
    const dialog = page.getByRole("dialog", { name: "Live demo" });
    await expect(dialog).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]pearl=/);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]pearl=/);
    await expect(page.locator("[data-media-viewer][data-open]")).toHaveCount(0);

    await card.hover();
    await card.getByRole("button", { name: "Open large" }).click();
    await expect(dialog).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]pearl=/);
  });

  test("a frame that never loads falls back to the preview", async ({ page, seed }) => {
    await page.addInitScript(() => {
      (window as Window & { __purlEmbedTimeoutMs?: number }).__purlEmbedTimeoutMs = 300;
    });
    // Never answered: the frame never loads.
    await page.route("https://live.example/**", () => {});
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await openGrid(page);

    const card = liveCard(page, "Live demo");
    await expect(card.getByText("Couldn't load")).toBeVisible();
    await expect(card.locator("iframe")).toHaveCount(0);
    await expect(card.locator("[data-embed-preview]")).toBeVisible();
    // No frame, no cover: the square opens the viewer.
    await expect(card.getByRole("button", { name: "Interact with Live demo" })).toHaveCount(0);
  });

  test("deleting the active card leaves no card active", async ({ page, seed }) => {
    await serveLivePage(page);
    await seed.link({ url: "https://live.example/b", title: "Live B", embed: true });
    await seed.link({ url: "https://live.example/a", title: "Live A", embed: true });
    await openGrid(page);

    const a = liveCard(page, "Live A");
    const b = liveCard(page, "Live B");
    await a.getByRole("button", { name: "Interact with Live A" }).click();
    await expect(a.locator('[data-face="embed"]')).toHaveAttribute("data-active", "true");

    await a.hover();
    await a.getByRole("button", { name: "Open link menu" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(a).toHaveCount(0);

    const coverB = b.getByRole("button", { name: "Interact with Live B" });
    await coverB.click();
    await expect(b.locator('[data-face="embed"]')).toHaveAttribute("data-active", "true");
    await expect(coverB).toBeHidden();
  });
});

test.describe("Live grid cards on phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("no frame: the preview and the Live pill, and a tap opens the viewer", async ({
    page,
    seed,
  }) => {
    await serveLivePage(page);
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await openGrid(page, { tap: true });

    const card = liveCard(page, "Live demo");
    await expect(card.locator('[data-face="embed"]')).toBeVisible();
    await expect(card.getByText("Live", { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(card.locator("iframe")).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Interact with Live demo" })).toBeHidden();
    await card.tap();
    await expect(page.getByRole("dialog", { name: "Live demo" })).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]pearl=/);
  });
});

test.describe("Live grid cards, visited signed out", () => {
  test.use({ signedIn: false, viewport: { width: 1280, height: 720 } });

  test("a public folder shows its live card to visitors", async ({ page, seed, testUser }) => {
    await serveLivePage(page);
    const folder = await seed.folder({ name: "Live", slug: "live", isPublic: true });
    await seed.link({
      url: "https://live.example/",
      title: "Live demo",
      embed: true,
      folderId: folder,
    });
    await page.goto(`/@${testUser.username}/live`);

    const card = liveCard(page, "Live demo");
    const face = card.locator('[data-face="embed"]');
    const box = (await face.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
    await expect(card.locator('iframe[title="Live demo"]')).toHaveAttribute(
      "data-state",
      "loaded",
    );
    await expect(card.getByRole("button", { name: "Interact with Live demo" })).toBeVisible();
  });
});
