import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import type { seedLink } from "./support/db";
import { silentWav } from "./support/media";

// The media viewer: an image pearl's card in the owner's grid opens it (the
// card morphs into the dialog), Esc closes it back onto the card, and the
// URL carries `?pearl=<id>` while it's open. Page links still open a tab.

const cards = (page: Page) => page.locator('[data-cy="link-card"]');
const openButton = (page: Page, title: string) =>
  page.getByRole("button", { name: title, exact: true });

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"], [data-cy="link-card"]');
  await page.waitForLoadState("networkidle");
}

async function chooseGrid(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "View mode" }).click();
  const saved = page.waitForResponse(
    (res) => res.url().endsWith("/api/user/layout") && res.request().method() === "PATCH",
  );
  await page.getByRole("menuitemradio", { name: "Grid" }).click();
  expect((await saved).ok()).toBe(true);
}

/** A page link, then two images (newest first: Shot A, Shot B, the page). */
async function seedPearls(
  seed: { link: (link: Parameters<typeof seedLink>[1]) => Promise<string> },
  baseURL: string,
) {
  const icon = `${baseURL}/icon.png`;
  const page = await seed.link({ url: "https://alpha.example", title: "Alpha" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const shotB = await seed.link({
    url: `${icon}?b=1`,
    title: "Shot B",
    contentType: "IMAGE",
    thumbnail: icon,
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const shotA = await seed.link({
    url: `${icon}?a=1`,
    title: "Shot A",
    contentType: "IMAGE",
    thumbnail: icon,
    width: 32,
    height: 32,
  });
  return { page, shotA, shotB };
}

/**
 * A public folder "Board" (slug `board`), newest first: Shot A, Shot B,
 * a page link (Alpha), then an audio pearl (Song).
 */
async function seedSharedBoard(
  seed: {
    link: (link: Parameters<typeof seedLink>[1]) => Promise<string>;
    folder: (folder: { name: string; slug: string; isPublic?: boolean }) => Promise<string>;
  },
  baseURL: string,
) {
  const icon = `${baseURL}/icon.png`;
  const folderId = await seed.folder({ name: "Board", slug: "board", isPublic: true });
  const pause = () => new Promise((resolve) => setTimeout(resolve, 15));
  await seed.link({
    url: "https://sounds.example/song.wav",
    title: "Song",
    contentType: "AUDIO",
    duration: 10,
    folderId,
  });
  await pause();
  await seed.link({ url: "https://alpha.example", title: "Alpha", folderId });
  await pause();
  const shotB = await seed.link({
    url: `${icon}?b=1`,
    title: "Shot B",
    contentType: "IMAGE",
    thumbnail: icon,
    folderId,
  });
  await pause();
  const shotA = await seed.link({
    url: `${icon}?a=1`,
    title: "Shot A",
    contentType: "IMAGE",
    thumbnail: icon,
    width: 32,
    height: 32,
    folderId,
  });
  return { shotA, shotB };
}

/** Three images, newest first: Shot A, Shot B, Shot C (800×600 boxes). */
async function seedThreeShots(
  seed: { link: (link: Parameters<typeof seedLink>[1]) => Promise<string> },
  baseURL: string,
) {
  const icon = `${baseURL}/icon.png`;
  const ids: Record<string, string> = {};
  for (const name of ["C", "B", "A"]) {
    ids[name] = await seed.link({
      url: `${icon}?${name.toLowerCase()}=1`,
      title: `Shot ${name}`,
      contentType: "IMAGE",
      thumbnail: icon,
      width: 800,
      height: 600,
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  return { shotA: ids.A, shotB: ids.B, shotC: ids.C };
}

/** The viewer's live region (the dialog's own; announced on each move). */
const viewerStatus = (page: Page) =>
  page.locator("[data-media-viewer] [data-viewer-status]");

test.describe("Media viewer", () => {
  test("an image card opens the viewer; Esc closes it back onto the card", async ({
    page,
    seed,
    baseURL,
  }) => {
    const { shotA } = await seedPearls(seed, baseURL!);
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(3);

    await openButton(page, "Shot A").click();
    const dialog = page.getByRole("dialog", { name: "Shot A" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img[alt="Shot A"]')).toBeVisible();
    // The original loads once the morph has played, and takes over the name
    // from the preview.
    await expect(dialog.locator('img[src$="?a=1"]')).toHaveAttribute("alt", "Shot A");
    await expect(dialog.locator('img[alt="Shot A"]')).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    // App shortcuts (folder digits, selection keys) stand down while it's open.
    await expect(page.locator("[data-media-viewer][data-open]")).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get("pearl")).toBe(shotA);

    await page.keyboard.press("Escape");
    // At once, while it still morphs back: drawn, but inert (not announced,
    // not focusable), so no dialog is reachable.
    expect(
      await page
        .locator("[data-media-viewer]")
        .evaluateAll((els) => els.length > 0 && els.every((el) => (el as HTMLElement).inert)),
    ).toBe(true);
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(await page.getByRole("button", { name: "Close" }).count()).toBe(0);
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has("pearl")).toBe(false);
    await expect(openButton(page, "Shot A")).toBeFocused();
  });

  test("an image that won't load shows the icon tile, never a broken image", async ({
    page,
    seed,
    baseURL,
  }) => {
    const nope = `${baseURL}/nope.png`;
    await seed.link({
      url: nope,
      title: "Gone",
      contentType: "IMAGE",
      thumbnail: nope,
      width: 800,
      height: 600,
    });
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(1);

    await openButton(page, "Gone").click();
    const dialog = page.getByRole("dialog", { name: "Gone" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-viewer-media="fallback"] svg')).toBeVisible();
    // The original is tried after the morph and fails too: no image is left.
    await expect(dialog.locator("img")).toHaveCount(0);
  });

  test("while selecting, a click on an image card toggles it and opens nothing", async ({
    page,
    seed,
    baseURL,
  }) => {
    await seedPearls(seed, baseURL!);
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(3);

    const shotA = cards(page).first();
    await shotA.hover();
    await page.getByRole("checkbox", { name: "Select Shot A" }).click();
    await expect(page.getByRole("checkbox", { name: "Select Shot A" })).toBeChecked();

    // While selecting, the card's button leaves the accessibility tree.
    await cards(page).nth(1).locator("[data-pearl-button]").click();
    await expect(page.getByRole("checkbox", { name: "Select Shot B" })).toBeChecked();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("pearl")).toBe(false);
  });

  test("a page link's card still opens a new tab, not the viewer", async ({
    page,
    seed,
    baseURL,
  }) => {
    await page.context().route("https://alpha.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>Alpha</title>" }),
    );
    await seedPearls(seed, baseURL!);
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(3);

    const popup = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Alpha (opens in new tab)", exact: true }).click();
    await (await popup).close();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a video card opens the player, and the card's loop pauses meanwhile", async ({
    page,
    seed,
    baseURL,
  }) => {
    // A file that never arrives: no codec needed, and no error either, so
    // the card's muted loop is live (play() was called) until the viewer
    // takes over.
    await page.context().route("https://loops.example/**", () => {});
    const icon = `${baseURL}/icon.png`;
    await seed.link({
      url: "https://loops.example/clip.mp4",
      title: "Clip",
      contentType: "VIDEO",
      thumbnail: icon,
      duration: 14,
    });
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(1);

    const cardVideo = cards(page).first().locator("video");
    await expect.poll(() => cardVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

    await openButton(page, "Clip").click();
    const dialog = page.getByRole("dialog", { name: "Clip" });
    await expect(dialog).toBeVisible();
    const player = dialog.locator("video[controls]");
    await expect(player).toHaveCount(1);
    await expect(player).toHaveAttribute("poster", icon);
    await expect(player).toHaveAttribute("autoplay", "");
    await expect.poll(() => cardVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    // Back on the grid, the card's loop picks up again.
    await expect.poll(() => cardVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  });

  test("a video that can't play keeps its poster, the controls and a line saying so", async ({
    page,
    seed,
    baseURL,
  }) => {
    await page.context().route("https://clips.example/**", (route) => route.abort());
    const icon = `${baseURL}/icon.png`;
    await seed.link({
      url: "https://clips.example/clip.mp4",
      title: "Broken clip",
      contentType: "VIDEO",
      thumbnail: icon,
      duration: 14,
    });
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(1);

    await openButton(page, "Broken clip").click();
    const dialog = page.getByRole("dialog", { name: "Broken clip" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Can't play this video", { exact: true })).toBeVisible();
    const player = dialog.locator("video[controls]");
    await expect(player).toHaveCount(1);
    await expect(player).toHaveAttribute("poster", icon);
  });

  test("an audio card opens the player at viewer size; the card's strip stops", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seed.link({
      url: "https://sounds.example/song.wav",
      title: "Song",
      contentType: "AUDIO",
      duration: 10,
    });
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(1);

    const card = cards(page).first();
    await card.getByRole("button", { name: "Play Song" }).click();
    await expect(card.getByRole("button", { name: "Pause Song" })).toBeVisible();

    // The card's button, below the player's controls (on the title strip).
    const opener = openButton(page, "Song");
    const box = (await opener.boundingBox())!;
    await opener.click({ position: { x: 12, y: box.height - 12 } });
    const dialog = page.getByRole("dialog", { name: "Song" });
    await expect(dialog).toBeVisible();
    // The title, shown above the player (not only as the dialog's name).
    await expect(
      dialog.locator('[data-viewer-media="audio"]').getByText("Song", { exact: true }),
    ).toBeVisible();
    const play = dialog.getByRole("button", { name: "Play Song" });
    await expect(play).toBeVisible();
    // The viewer starts fresh: the card's strip stopped when it opened.
    await expect(card.locator('button[aria-label="Play Song"]')).toHaveCount(1);
    // 56px (its layout size: the box may still be scaling in the morph).
    expect(await play.evaluate((el: HTMLElement) => el.offsetWidth)).toBe(56);

    // The viewer's player plays on its own; the card's strip stays stopped.
    await play.click();
    await expect(dialog.getByRole("button", { name: "Pause Song" })).toBeVisible();
    await expect(card.locator('button[aria-label="Play Song"]')).toHaveCount(1);

    // Closing stops it.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => [...document.querySelectorAll("audio")].every((a) => a.paused)),
      )
      .toBe(true);
  });
  test("an image row opens the viewer; Esc gives focus back to the row", async ({
    page,
    seed,
    baseURL,
  }) => {
    const { shotA } = await seedPearls(seed, baseURL!);
    await openHome(page);
    const row = page.locator('[data-cy="link-item"]').filter({ hasText: "Shot A" });
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(3);

    // A click on the row's title (the row's button covers the whole row).
    const title = (await row.getByText("Shot A", { exact: true }).boundingBox())!;
    await page.mouse.click(title.x + title.width / 2, title.y + title.height / 2);
    const dialog = page.getByRole("dialog", { name: "Shot A" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("pearl")).toBe(shotA);

    // The pointer is still over the row, which hides its favicon for the
    // checkbox; while the icon morphs (open, then back) the favicon stays
    // whole, so the morph back lands in it, and its list item lifts its
    // `content-visibility` containment (which would clip the morph to the
    // row). Sampled every frame until the morph back has played.
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = window as unknown as { samples: string[][]; sampled: boolean };
      w.samples = [];
      w.sampled = false;
      const tick = () => {
        const anchor = document.querySelector('[data-cy="link-item"] [data-pearl-morphing]');
        if (!anchor) {
          w.sampled = true;
          return;
        }
        const style = getComputedStyle(anchor.closest('[data-cy="row-favicon"]')!);
        const item = getComputedStyle(anchor.closest('[role="listitem"]')!);
        w.samples.push([style.opacity, style.scale, item.contentVisibility]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has("pearl")).toBe(false);
    await expect(row.locator("[data-pearl-button]")).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { sampled: boolean }).sampled))
      .toBe(true);
    const samples = await page.evaluate(
      () => (window as unknown as { samples: string[][] }).samples,
    );
    expect(samples.length).toBeGreaterThan(3);
    for (const [opacity, scale, contentVisibility] of samples) {
      expect(opacity).toBe("1");
      expect(["none", "1"]).toContain(scale);
      expect(contentVisibility).toBe("visible");
    }
    // By keyboard, with the pointer elsewhere: focus comes back from the
    // viewer, not by keyboard navigation, so no preview pops up beside the
    // row while its icon morphs back.
    await page.mouse.move(5, 400);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect(row.locator("[data-pearl-button]")).toBeFocused();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
    // A page link's row is still a link to a new tab.
    await expect(
      page.getByRole("link", { name: "Alpha (opens in new tab)", exact: true }),
    ).toHaveAttribute("href", "https://alpha.example");
  });

  test("a media pearl's menu opens the file; a page link's keeps Open in new tab", async ({
    page,
    seed,
    baseURL,
  }) => {
    await seedPearls(seed, baseURL!);
    await openHome(page);
    const row = (title: string) =>
      page.locator('[data-cy="link-item"]').filter({ hasText: title });

    await row("Shot A").hover();
    await row("Shot A").getByRole("button", { name: "Open link menu" }).click();
    const openFile = page.getByRole("menuitem", { name: "Open file" });
    await expect(openFile).toHaveAttribute("href", `${baseURL}/icon.png?a=1`);
    await expect(openFile).toHaveAttribute("target", "_blank");
    await expect(openFile).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByRole("menuitem", { name: "Open in new tab" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(openFile).toHaveCount(0);

    await row("Alpha").hover();
    await row("Alpha").getByRole("button", { name: "Open link menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Open in new tab" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Open file" })).toHaveCount(0);
  });

  test("on a shared folder, an image card opens the viewer and audio plays in place", async ({
    browser,
    seed,
    testUser,
    baseURL,
  }) => {
    const { shotA } = await seedSharedBoard(seed, baseURL!);

    // Signed out.
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await context.route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await page.goto(`/@${testUser.username}/board`);
    await waitForHydration(page, 'button[aria-label="Grid view"]');
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect(cards(page)).toHaveCount(4);

    await openButton(page, "Shot A").click();
    const dialog = page.getByRole("dialog", { name: "Shot A" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img[src$="?a=1"]')).toHaveAttribute("alt", "Shot A");
    await expect.poll(() => new URL(page.url()).searchParams.get("pearl")).toBe(shotA);

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has("pearl")).toBe(false);
    await expect(openButton(page, "Shot A")).toBeFocused();

    // The audio card's Play plays in place: no viewer, no new entry.
    const songCard = cards(page).filter({ has: openButton(page, "Song") });
    await songCard.getByRole("button", { name: "Play Song" }).click();
    await expect(songCard.getByRole("button", { name: "Pause Song" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("pearl")).toBe(false);
    await context.close();
  });

  test("arrows, keys and buttons move between pearls; Esc lands on the one shown", async ({
    page,
    seed,
    baseURL,
  }) => {
    const { shotA, shotB } = await seedThreeShots(seed, baseURL!);
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(3);

    await openButton(page, "Shot A").click();
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("pearl")).toBe(shotA);
    const entries = await page.evaluate(() => history.length);
    // Nothing to go back to on the first.
    await expect(page.getByRole("button", { name: "Previous pearl" })).toHaveCount(0);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Shot B" })).toBeVisible();
    await expect(viewerStatus(page)).toHaveText("2 of 3: Shot B");
    await expect(viewerStatus(page)).toHaveAttribute("role", "status");
    // The param is replaced in place: no new history entry.
    await expect.poll(() => new URL(page.url()).searchParams.get("pearl")).toBe(shotB);
    expect(await page.evaluate(() => history.length)).toBe(entries);

    await page.keyboard.press("Home");
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await expect(viewerStatus(page)).toHaveText("1 of 3: Shot A");

    // Two presses in quick succession both count.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Shot C" })).toBeVisible();
    await expect(viewerStatus(page)).toHaveText("3 of 3: Shot C");
    await expect(page.getByRole("button", { name: "Next pearl" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Previous pearl" })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft",
    );

    // The buttons (shown on hover).
    await page.getByRole("dialog").hover();
    await page.getByRole("button", { name: "Previous pearl" }).click();
    await expect(page.getByRole("dialog", { name: "Shot B" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next pearl" })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowRight",
    );
    await page.getByRole("button", { name: "Next pearl" }).click();
    await expect(page.getByRole("dialog", { name: "Shot C" })).toBeVisible();
    // The last pearl's button is gone; focus stays in the viewer.
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(document.activeElement?.closest("[data-media-viewer]"))),
      )
      .toBe(true);

    await page.keyboard.press("Home");
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await page.keyboard.press("End");
    await expect(page.getByRole("dialog", { name: "Shot C" })).toBeVisible();
    await expect(page.getByRole("dialog").locator('img[src$="?c=1"]')).toHaveAttribute(
      "alt",
      "Shot C",
    );

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has("pearl")).toBe(false);
    await expect(openButton(page, "Shot C")).toBeFocused();
    // Shot A's card (opened from, never morphed back into) isn't left raised.
    await expect(page.locator("[data-pearl-morphing]")).toHaveCount(0, { timeout: 500 });
  });

  test("with reduced motion the viewer still opens and moves, and video doesn't autoplay", async ({
    page,
    seed,
    baseURL,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.context().route("https://loops.example/**", () => {});
    const icon = `${baseURL}/icon.png`;
    await seed.link({
      url: `${icon}?still=1`,
      title: "Still",
      contentType: "IMAGE",
      thumbnail: icon,
      width: 800,
      height: 600,
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await seed.link({
      url: "https://loops.example/clip.mp4",
      title: "Clip",
      contentType: "VIDEO",
      thumbnail: icon,
      duration: 14,
    });
    await openHome(page);
    await chooseGrid(page);
    await expect(cards(page)).toHaveCount(2);

    await openButton(page, "Clip").click();
    const dialog = page.getByRole("dialog", { name: "Clip" });
    await expect(dialog).toBeVisible();
    const player = dialog.locator("video[controls]");
    await expect(player).toHaveCount(1);
    await expect(player).not.toHaveAttribute("autoplay");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Still" })).toBeVisible();
    await expect(viewerStatus(page)).toHaveText("2 of 2: Still");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await expect(openButton(page, "Still")).toBeFocused();
    // The card it didn't morph back into isn't left raised for the morph.
    await expect(page.locator("[data-pearl-morphing]")).toHaveCount(0, { timeout: 500 });
  });

  test("on a shared folder, → moves to the next media pearl, past page links", async ({
    browser,
    seed,
    testUser,
    baseURL,
  }) => {
    const { shotB } = await seedSharedBoard(seed, baseURL!);
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto(`/@${testUser.username}/board`);
    await waitForHydration(page, 'button[aria-label="Grid view"]');
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect(cards(page)).toHaveCount(4);

    await openButton(page, "Shot A").click();
    await expect(page.getByRole("dialog", { name: "Shot A" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Shot B" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("pearl")).toBe(shotB);
    // Past the page link (Alpha), onto the audio pearl.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Song" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    await context.close();
  });
});

test.describe("Media viewer on phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Back closes the viewer and stays on the page; the buttons are finger-sized", async ({
    page,
    seed,
    baseURL,
  }) => {
    await seedThreeShots(seed, baseURL!);
    await openHome(page);
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(3);

    await openButton(page, "Shot B").tap();
    await expect(page.getByRole("dialog", { name: "Shot B" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("pearl")).toBe(true);

    // Shown without hover on touch screens, 40px plus 2px of invisible hit
    // area all round: 44px targets.
    for (const name of ["Previous pearl", "Next pearl", "Close"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS("opacity", "1");
      const target = await button.evaluate((el: HTMLElement) => {
        const hit = getComputedStyle(el, "::after");
        return {
          width: el.offsetWidth - 2 * parseFloat(hit.left),
          height: el.offsetHeight - 2 * parseFloat(hit.top),
        };
      });
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }

    await page.goBack();
    await expect(page.locator("[data-media-viewer]")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/home");
    expect(new URL(page.url()).searchParams.has("pearl")).toBe(false);
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(3);
  });
});
