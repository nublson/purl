import type { Locator, Page } from "@playwright/test";
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

  test("is busy while the check runs and ignores another toggle", async ({ page, seed }) => {
    await seed.link({ url: "https://example.com", title: "Example" });
    let patches = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/links/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patches += 1;
      await held;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Couldn't reach this site", code: "UNREACHABLE" }),
      });
    });
    await page.goto("/home");
    await waitForHydration(page, '[aria-label="Open link menu"]');
    await openMenu(page, "Example");
    const item = page.getByRole("menuitemcheckbox", { name: "Show live" });
    await item.click();
    await expect(item).toHaveAttribute("aria-busy", "true");
    await expect(item).toHaveAttribute("aria-checked", "true");
    await item.click();
    await expect(item).toHaveAttribute("aria-checked", "true");
    expect(patches).toBe(1);

    release();
    await expect(page.getByText("Couldn't reach this site")).toBeVisible();
    await expect(item).toHaveAttribute("aria-checked", "false");
    await expect(item).not.toHaveAttribute("aria-busy", "true");
    expect(patches).toBe(1);
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

/** A 1×1 PNG, for a live page's thumbnail. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** Serves https://live.example/* with a small page holding an "Inside" button. */
async function serveLivePage(page: Page) {
  await page.route("https://live.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: LIVE_PAGE }),
  );
}

/** The live page's frame in the media viewer (the card's own is outside it). */
const viewerFrame = (page: Page, title: string) =>
  page.getByRole("dialog", { name: title }).locator("iframe");

const liveCard = (page: Page, title: string) =>
  page.locator('[data-cy="link-card"]').filter({ hasText: title });

/** Clicks a live card in the middle of its square (it lands on the card's opener). */
async function clickSquare(card: Locator) {
  const box = (await card.locator('[data-face="embed"]').boundingBox())!;
  await card.click({ position: { x: box.width / 2, y: box.height / 2 } });
}

async function openGrid(page: Page, { tap = false } = {}) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"], [data-cy="link-card"]');
  await chooseView(page, "Grid", { tap });
  await waitForHydration(page, '[data-cy="link-card"]');
}

test.describe("Live grid cards", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("a square face shows the page as a picture; the wheel scrolls the grid; a click opens the viewer", async ({
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
    // A picture: inert, so neither the pointer nor Tab reaches the page.
    await expect(frame).toHaveAttribute("inert", "");

    // The wheel over the square scrolls the grid, not the frame.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => page.locator("main").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await page.locator("main").evaluate((el) => (el.scrollTop = 0));

    const insideButton = page
      .frameLocator('iframe[title="Live demo"]')
      .getByRole("button", { name: "Inside" });
    await card.locator("[data-pearl-button]").first().focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase())).not.toBe(
      "iframe",
    );
    await expect(insideButton).not.toBeFocused();

    // A click on the square opens the viewer, where the page is live.
    await clickSquare(card);
    const dialog = page.getByRole("dialog", { name: "Live demo" });
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Open in new tab" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]pearl=/);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer][data-open]")).toHaveCount(0);

    // So does a click on the title strip under it.
    const cardBox = (await card.boundingBox())!;
    await card.click({ position: { x: 24, y: cardBox.height - 16 } });
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
  });

  test("the card's frame stops while its pearl is open in the viewer", async ({
    page,
    seed,
  }) => {
    await serveLivePage(page);
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await openGrid(page);

    const card = liveCard(page, "Live demo");
    const cardFrame = card.locator('iframe[title="Live demo"]');
    await expect(cardFrame).toHaveAttribute("data-state", "loaded");
    await clickSquare(card);
    await expect(viewerFrame(page, "Live demo")).toHaveAttribute("data-state", "loaded");
    await expect(cardFrame).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer][data-open]")).toHaveCount(0);
    await expect(cardFrame).toHaveAttribute("data-state", "loaded");
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
    await clickSquare(card);
    await expect(page.getByRole("dialog", { name: "Live demo" })).toHaveCount(1);
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
    // No frame on touch: the preview keeps a page card's 16:10, uncropped.
    const box = (await card.locator('[data-face="embed"]').boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(1.6, 1);
    await page.waitForTimeout(500);
    await expect(card.locator("iframe")).toHaveCount(0);
    await card.tap();
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
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
    await clickSquare(card);
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
  });
});

test.describe("Live list rows", () => {
  test("a Live mark, the viewer on click, and an image preview on hover", async ({
    page,
    seed,
  }) => {
    await serveLivePage(page);
    // The page's picture, for the hover preview (registered after, so it wins).
    await page.route("https://live.example/thumb.png", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }),
    );
    await seed.link({
      url: "https://live.example/",
      title: "Live demo",
      embed: true,
      thumbnail: "https://live.example/thumb.png",
    });
    await seed.link({ url: "https://plain.example/", title: "Plain page" });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');

    const row = page.locator('[data-cy="link-item"]', { hasText: "Live demo" });
    await expect(row.getByText("Live", { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-cy="link-item"]', { hasText: "Plain page" }).getByText("Live", {
        exact: true,
      }),
    ).toHaveCount(0);

    // Hover preview: the page's picture, never a frame.
    await row.hover();
    const preview = page.locator('[data-slot="hover-card-content"]');
    await expect(preview.locator('img[src*="thumb.png"]')).toBeVisible();
    await expect(preview.locator("iframe")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);

    let popup = false;
    page.on("popup", () => (popup = true));
    await row.click();
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
    await expect(page).toHaveURL(/[?&]pearl=/);
    expect(popup).toBe(false);
  });
});

// Live pages in the media viewer: the box (16:10 landscape, 3:4 portrait),
// the frame once the morph has played, the header line, moving, the URL,
// focus leaving the page, and a page that never loads.

/** The viewer's live box, as width over height. */
async function viewerBoxRatio(page: Page) {
  const box = await page.locator("[data-media-viewer] [data-embed-box]").boundingBox();
  expect(box).not.toBeNull();
  return box!.width / box!.height;
}

test.describe("Live pages in the viewer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a live card opens the preview, then the frame, in a 16:10 box with the header line", async ({
    page,
    seed,
  }) => {
    await serveLivePage(page);
    await seed.link({
      url: "https://live.example/demo",
      title: "Live demo",
      embed: true,
    });
    await openGrid(page);

    const card = liveCard(page, "Live demo");
    const box = (await card.boundingBox())!;
    await card.click({ position: { x: 24, y: box.height - 16 } });
    const dialog = page.getByRole("dialog", { name: "Live demo" });
    await expect(dialog.locator("[data-embed-preview]")).toHaveCount(1);
    const frame = viewerFrame(page, "Live demo");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-state", "loaded");
    await expect(frame).toHaveAttribute("title", "Live demo");
    await expect(frame).not.toHaveAttribute("sandbox", /allow-top-navigation/);
    expect(Math.abs((await viewerBoxRatio(page)) - 1.6)).toBeLessThan(0.02);
    // The box and its header stay within the viewer's 80% of the height.
    const popup = (await page.locator("[data-media-viewer]").boundingBox())!;
    expect(popup.height).toBeLessThanOrEqual(900 * 0.8 + 1);

    const header = dialog.locator("[data-embed-header]");
    await expect(header.getByText("Live demo", { exact: true })).toBeVisible();
    await expect(header.getByText("live.example", { exact: true })).toBeVisible();
    const link = header.getByRole("link", { name: "Open in new tab" });
    await expect(link).toHaveAttribute("href", "https://live.example/demo");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);

    // The page is live at once: a click reaches it.
    await frame.contentFrame().getByRole("button", { name: "Inside" }).click();
    await expect(frame.contentFrame().locator('body[data-clicked="1"]')).toHaveCount(1);
  });

  test("Next and Previous move between an image and a live page, past audio", async ({
    page,
    seed,
    baseURL,
  }) => {
    await serveLivePage(page);
    const pause = () => new Promise((resolve) => setTimeout(resolve, 15));
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await pause();
    await seed.link({
      url: "https://sounds.example/song.wav",
      title: "Song",
      contentType: "AUDIO",
      duration: 10,
    });
    await pause();
    const icon = `${baseURL}/icon.png`;
    await seed.link({
      url: `${icon}?a=1`,
      title: "Shot A",
      contentType: "IMAGE",
      thumbnail: icon,
      width: 800,
      height: 600,
    });
    await openGrid(page);

    await page.getByRole("button", { name: "Shot A", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await expect(page.locator("[data-embed-header]")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
    await expect(page.locator("[data-media-viewer] [data-viewer-status]")).toHaveText(
      "2 of 2: Live demo",
    );
    await expect(page.locator("[data-embed-header]")).toHaveCount(1);
    await page.getByRole("dialog").hover();
    await expect(page.getByRole("button", { name: "Next pearl" })).toHaveCount(0);
    await page.getByRole("button", { name: "Previous pearl" }).click();
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Song" })).toHaveCount(0);
  });

  test("?pearl=<live id> opens it on load", async ({ page, seed }) => {
    await serveLivePage(page);
    const id = await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await page.goto(`/home?pearl=${id}`);
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
    await expect(viewerFrame(page, "Live demo")).toHaveAttribute("data-state", "loaded");
  });

  test("Tab out of the page reaches the viewer's Close", async ({ page, seed }) => {
    await serveLivePage(page);
    const id = await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await page.goto(`/home?pearl=${id}`);
    const frame = viewerFrame(page, "Live demo");
    await expect(frame).toHaveAttribute("data-state", "loaded");
    const inside = frame.contentFrame().locator("button");
    await inside.focus();
    await expect(inside).toBeFocused();

    const close = page.getByRole("dialog", { name: "Live demo" }).getByRole("button", {
      name: "Close",
    });
    let reached = false;
    for (let i = 0; i < 6 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await close.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
    // Esc from Purl (not the page) closes it.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
  });

  test("a page that never loads keeps the preview and says so, with the link", async ({
    page,
    seed,
  }) => {
    await page.addInitScript(() => {
      (window as Window & { __purlEmbedTimeoutMs?: number }).__purlEmbedTimeoutMs = 300;
    });
    // Never answered: the frame never loads. (An aborted request isn't
    // that: the browser's error page fires `load`, like a blocked frame.)
    await page.route("https://live.example/**", () => {});
    const id = await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await page.goto(`/home?pearl=${id}`);

    const dialog = page.getByRole("dialog", { name: "Live demo" });
    const status = dialog.getByRole("status").filter({ hasText: "Couldn't load this page" });
    await expect(status).toBeVisible();
    await expect(status.getByRole("link", { name: "Open in new tab" })).toHaveAttribute(
      "href",
      "https://live.example/",
    );
    await expect(dialog.locator("iframe")).toHaveCount(0);
    await expect(dialog.locator("[data-embed-preview]")).toBeVisible();
    const popup = (await page.locator("[data-media-viewer]").boundingBox())!;
    expect(popup.height).toBeLessThanOrEqual(900 * 0.8 + 1);
  });
});

test.describe("Live pages in the viewer on phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the box is 3:4", async ({ page, seed }) => {
    await serveLivePage(page);
    await seed.link({ url: "https://live.example/", title: "Live demo", embed: true });
    await openGrid(page, { tap: true });
    await liveCard(page, "Live demo").tap();
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
    expect(Math.abs((await viewerBoxRatio(page)) - 0.75)).toBeLessThan(0.02);
  });
});

test.describe("Live pages in the viewer, visited signed out", () => {
  test.use({ signedIn: false, viewport: { width: 1280, height: 720 } });

  test("?pearl=<live id> opens it on a shared folder", async ({ page, seed, testUser }) => {
    await serveLivePage(page);
    const folder = await seed.folder({ name: "Live", slug: "live", isPublic: true });
    const id = await seed.link({
      url: "https://live.example/",
      title: "Live demo",
      embed: true,
      folderId: folder,
    });
    await page.goto(`/@${testUser.username}/live?pearl=${id}`);
    await expect(viewerFrame(page, "Live demo")).toBeVisible();
    await expect(page.locator("[data-embed-header]")).toHaveCount(1);
  });
});
