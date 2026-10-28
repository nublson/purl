import type { Locator, Page, Route } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import type { seedLink } from "./support/db";
import { silentWav } from "./support/media";

// Image, video and audio pearls show the media itself: the grid card is the
// image or the video (no title strip), audio is a now-playing bar (sleeve,
// title, second line, play, a track along the foot), and a list row's
// favicon slot is the image's preview.

const cards = (page: Page) => page.locator('[data-cy="link-card"]');
// A page's card is a link; an image or video pearl's card opens the viewer
// (a button); an audio pearl's card is its bar (found by its track, whose
// name never changes).
const card = (page: Page, title: string) =>
  cards(page).filter({
    has: page
      .getByRole("link", { name: `${title} (opens in new tab)`, exact: true })
      .or(page.getByRole("button", { name: title, exact: true }))
      .or(page.locator(`[data-face="audio"] input[aria-label="Seek ${title}"]`)),
  });
const row = (page: Page, title: string) =>
  page.locator('[data-cy="link-item"]').filter({ hasText: title });

async function openHome(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="link-item"], [data-cy="link-card"]');
  await page.waitForLoadState("networkidle");
}

/** The user menu's "View mode", opened to its List / Grid choices. */
async function openViewMode(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "View mode" }).click();
}

async function chooseView(page: Page, view: "List" | "Grid") {
  await openViewMode(page);
  const item = page.getByRole("menuitemradio", { name: view });
  const saved = page.waitForResponse(
    (res) => res.url().endsWith("/api/user/layout") && res.request().method() === "PATCH",
  );
  await item.click();
  expect((await saved).ok()).toBe(true);
}

type Seed = { link: (link: Parameters<typeof seedLink>[1]) => Promise<string> };

/** An uploaded audio pearl, 2:36 long, with no preview image. */
function seedSong(seed: Seed, title = "Song") {
  return seed.link({
    url: "https://sounds.example/song.wav",
    title,
    contentType: "AUDIO",
    mimeType: "audio/wav",
    duration: 156,
    fileKey: "users/e2e/song/song.wav",
    fileSize: 1000,
  });
}

/** Whether `inner`'s box lies within `outer`'s. */
async function insideBox(inner: Locator, outer: Locator) {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  if (!a || !b) return false;
  return (
    a.x >= b.x - 0.5 &&
    a.y >= b.y - 0.5 &&
    a.x + a.width <= b.x + b.width + 0.5 &&
    a.y + a.height <= b.y + b.height + 0.5
  );
}

/**
 * A real click at `target`'s centre, wherever it lands: the bar's words take
 * no pointer events of their own (the card's surface lies under them).
 */
async function clickAt(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("no box to click");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** The bar's second line as shown (under 200px an upload's is just its length). */
function secondLine(scope: Locator) {
  return scope
    .locator("[data-words] > :nth-child(2)")
    .evaluate((el) => (el as HTMLElement).innerText.trim());
}

/** The played run's width in px. */
function runWidth(scope: Locator) {
  return scope.locator("[data-run]").evaluate((el) => el.getBoundingClientRect().width);
}

test.describe("Media pearls", () => {
  test("cards show the image and the video", async ({
    page,
    seed,
    baseURL,
  }) => {
    // The app's own icon: an image that loads locally in both browsers.
    const icon = `${baseURL}/icon.png`;
    await page.context().route("https://clips.example/**", (route) => route.abort());

    await seed.link({
      url: "https://shots.example/a.png",
      title: "Shot A",
      contentType: "IMAGE",
      thumbnail: icon,
      width: 800,
      height: 600,
    });
    await seed.link({ url: `${icon}?b=1`, title: "Shot B", contentType: "IMAGE" });
    await seed.link({
      url: "https://clips.example/clip.mp4",
      title: "Clip",
      contentType: "VIDEO",
      duration: 14,
    });

    await openHome(page);
    await chooseView(page, "Grid");
    await expect(cards(page)).toHaveCount(3);

    // Image with its size: the image alone, at 800:600, no title or domain.
    const shotA = card(page, "Shot A");
    await expect(shotA.locator(`img[src="${icon}"]`)).toBeVisible();
    await expect(shotA).not.toContainText("Shot A");
    await expect(shotA).not.toContainText("shots.example");
    const face = shotA.locator('[data-face="image"]');
    await expect
      .poll(() => face.evaluate((el) => getComputedStyle(el).aspectRatio))
      .toBe("800 / 600");

    // Image without a preview: the file itself, loaded (never a broken image).
    const shotB = card(page, "Shot B");
    const shotBImg = shotB.locator(`img[src="${icon}?b=1"]`);
    await expect(shotBImg).toBeVisible();
    await expect
      .poll(() => shotBImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(shotB).not.toContainText("Shot B");
    // Unknown size: the box takes the image's own ratio once it loads (1:1).
    await expect
      .poll(() =>
        shotB.locator('[data-face="image"]').evaluate((el) => getComputedStyle(el).aspectRatio),
      )
      .toBe("32 / 32");

    // Video: muted, with the duration pill.
    const clip = card(page, "Clip");
    await expect(clip.locator("video[muted]")).toHaveCount(1);
    expect(await clip.locator("video").evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await expect(clip.getByText("0:14", { exact: true })).toBeVisible();
    await expect(clip).not.toContainText("Clip");
  });

  test("a broken image shows the image icon at its ratio, never a broken image", async ({
    page,
    seed,
    baseURL,
  }) => {
    await seed.link({
      url: "https://shots.example/gone.png",
      title: "Gone",
      contentType: "IMAGE",
      thumbnail: `${baseURL}/does-not-exist.png`,
      width: 800,
      height: 600,
    });
    await openHome(page);
    await chooseView(page, "Grid");

    const gone = card(page, "Gone");
    const face = gone.locator('[data-face="image"]');
    await expect(face.locator("img")).toHaveCount(0);
    await expect(face.locator("svg")).toBeVisible();
    expect(await face.evaluate((el) => getComputedStyle(el).aspectRatio)).toBe("800 / 600");
  });

  test("while selecting, a click on the bar selects the card; its controls step aside", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) => route.abort());
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await seedSong(seed);
    await openHome(page);
    await chooseView(page, "Grid");

    const alpha = card(page, "Alpha");
    await alpha.hover();
    await alpha.getByRole("checkbox", { name: "Select Alpha" }).click();

    // Find the card by its bar.
    const song = cards(page).filter({ has: page.locator('[data-face="audio"]') });
    const checkbox = song.getByRole("checkbox", { name: "Select Song" });
    // The checkbox takes the sleeve's place.
    await expect(checkbox).toBeVisible();
    expect(await insideBox(checkbox, song.locator("[data-sleeve]"))).toBe(true);

    // A click on the bar, away from its controls (on the words), selects it.
    await clickAt(page, song.locator("[data-words]"));
    await expect(checkbox).toBeChecked();

    // The controls step aside: out of reach of focus and clicks. The
    // sleeve is the bar's play button.
    const play = song.locator('[data-sleeve] button[data-play][aria-label="Play Song"]');
    await expect(play).toHaveAttribute("inert", "");
    expect(
      await play.evaluate((el: HTMLElement) => {
        el.focus();
        return document.activeElement === el;
      }),
    ).toBe(false);
    // A click where the Play button sits lands on the card (its checkbox,
    // in the sleeve's place), not the button.
    const box = await play.boundingBox();
    if (!box) throw new Error("no Play button box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(checkbox).not.toBeChecked();
    await expect(play).toHaveAttribute("aria-label", "Play Song");
    // The bar's opener steps aside too: the click selected, it didn't open.
    const expand = song.locator("[data-expand]");
    await expect(expand).toHaveAttribute("inert", "");
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    expect((await song.boundingBox())!.height).toBeLessThan(80);
  });

  test("one audio pearl plays at a time, and stops at its end", async ({ page, seed }) => {
    // Half a second of silence, served for both files.
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(0.5) }),
    );
    await seed.link({ url: "https://sounds.example/one.wav", title: "One", contentType: "AUDIO" });
    await seed.link({ url: "https://sounds.example/two.wav", title: "Two", contentType: "AUDIO" });
    await openHome(page);
    await chooseView(page, "Grid");

    const one = card(page, "One");
    const two = card(page, "Two");
    await one.getByRole("button", { name: "Play One" }).click();
    await expect(one.getByRole("button", { name: "Pause One" })).toBeVisible();

    await two.getByRole("button", { name: "Play Two" }).click();
    await expect(two.getByRole("button", { name: "Pause Two" })).toBeVisible();
    await expect(one.getByRole("button", { name: "Play One" })).toBeVisible();

    // At its end it stops on its own.
    await expect(two.getByRole("button", { name: "Play Two" })).toBeVisible({ timeout: 5000 });
  });

  test("a shared folder's grid shows the media; an audio card expands and plays in place", async ({
    browser,
    seed,
    testUser,
    baseURL,
  }) => {
    const icon = `${baseURL}/icon.png`;
    const folder = await seed.folder({ name: "Board", slug: "board", isPublic: true });
    await seed.link({
      url: "https://shots.example/a.png",
      title: "Shot A",
      contentType: "IMAGE",
      thumbnail: icon,
      width: 800,
      height: 600,
      folderId: folder,
    });
    await seed.link({
      url: "https://sounds.example/song.mp3",
      title: "Song",
      contentType: "AUDIO",
      duration: 65,
      folderId: folder,
    });

    // Signed out.
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await context.route("https://sounds.example/**", (route) => route.abort());
    await page.goto(`/@${testUser.username}/board`);
    await waitForHydration(page, 'button[aria-label="Grid view"]');
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect(cards(page)).toHaveCount(2);

    // A media pearl's shared card is the button that opens the viewer.
    const sharedCard = (title: string) =>
      page.getByRole("button", { name: title, exact: true });
    const shotA = sharedCard("Shot A");
    await expect(shotA.locator(`img[src="${icon}"]`)).toBeVisible();
    await expect(shotA).not.toContainText("Shot A");

    // An audio card is its bar: no button or link of its own (its controls
    // are the bar's).
    const songCard = cards(page).filter({ has: page.locator('[data-face="audio"]') });
    await expect(sharedCard("Song")).toHaveCount(0);
    // (Its Open file link is the opened player's, hidden while it's shut.)
    await expect(songCard.getByRole("link")).toHaveCount(0);
    let popups = 0;
    page.on("popup", () => popups++);
    const url = page.url();
    await songCard.getByRole("button", { name: "Play Song" }).click();
    await expect(songCard.getByRole("button", { name: "Play Song" })).toBeVisible();
    expect(popups).toBe(0);
    expect(page.url()).toBe(url);
    // A click on the bar away from its controls (its words) expands it in
    // place into the player: never the media viewer.
    await expect(songCard.locator('[data-face="audio"]')).toContainText("sounds.example");
    await clickAt(page, songCard.locator("[data-words]"));
    // Settling at 189 is the wait: a dialog would have opened by then.
    await expectOpen(songCard, "Song");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(popups).toBe(0);
    expect(page.url()).toBe(url);
    expect(page.url()).not.toContain("pearl");
    // A visitor reaches the file from the opened transport: a real link.
    const openFile = songCard.getByRole("link", { name: "Open file" });
    await expect(openFile).toBeVisible();
    await expect(openFile).toHaveAttribute("href", "https://sounds.example/song.mp3");
    await expect(openFile).toHaveAttribute("target", "_blank");
    // The transport's Play plays inline (the file fails here, so it comes
    // back to Play; what matters is that nothing opened).
    await songCard.getByRole("button", { name: "Play Song", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).not.toContain("pearl");
    // Esc collapses it.
    await page.keyboard.press("Escape");
    await expectShut(songCard, "Song");
    expect(popups).toBe(0);
    await context.close();
  });

  test("an image row's favicon is its preview", async ({ page, seed, baseURL }) => {
    const icon = `${baseURL}/icon.png`;
    await seed.link({
      url: "https://shots.example/a.png",
      title: "Shot A",
      contentType: "IMAGE",
      thumbnail: icon,
      width: 800,
      height: 600,
    });
    await seed.link({ url: `${icon}?b=1`, title: "Shot B", contentType: "IMAGE" });
    await openHome(page);

    await expect(row(page, "Shot A").locator('[data-cy="row-favicon"] img')).toHaveAttribute(
      "src",
      icon,
    );
    await expect(row(page, "Shot B").locator('[data-cy="row-favicon"] img')).toHaveAttribute(
      "src",
      `${icon}?b=1`,
    );
  });
});

test.describe("Audio pearls: the now-playing bar", () => {
  test("the bar's parts; one plays at a time; a file that won't load goes back to Play", async ({
    page,
    seed,
    baseURL,
  }) => {
    const icon = `${baseURL}/icon.png`;
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    // Birds' host never answers until the test lets it fail: then every
    // request held and every one after it (WebKit tries again) fails.
    const birdsRequests: Route[] = [];
    let birdsDown = false;
    await page.context().route("https://birds.example/**", (route) => {
      if (birdsDown) return route.abort();
      birdsRequests.push(route);
    });
    const failBirds = async () => {
      await expect.poll(() => birdsRequests.length).toBeGreaterThan(0);
      birdsDown = true;
      for (const route of birdsRequests) await route.abort().catch(() => {});
    };
    await seed.link({
      url: "https://birds.example/birds.mp3",
      title: "Birds",
      contentType: "AUDIO",
      thumbnail: icon,
    });
    await seedSong(seed);
    await openHome(page);
    await chooseView(page, "Grid");

    const song = card(page, "Song");
    const birds = card(page, "Birds");
    // The card is its bar: never a link, and no button opens the viewer.
    // (Its Open file link is the opened player's, hidden while it's shut.)
    await expect(song.getByRole("link")).toHaveCount(0);
    await expect(song.getByRole("button", { name: "Song", exact: true })).toHaveCount(0);
    const bar = song.locator('[data-face="audio"]');
    await expect(bar.locator("[data-words]")).toContainText("Song");
    // At 210px the second line is the upload's facts in full; the sleeve
    // is the play control.
    expect(await secondLine(bar)).toBe("Audio · 2:36");
    const songPlay = song.getByRole("button", { name: "Play Song" });
    // The name says what a press does; no `aria-pressed` on top of it.
    await expect(songPlay).not.toHaveAttribute("aria-pressed");
    expect(await songPlay.evaluate((el) => el.closest("[data-sleeve]") !== null)).toBe(true);
    await expect(song.getByRole("slider", { name: "Seek Song" })).toHaveCount(1);
    // No preview image: the icon sleeve; Birds' page image is its sleeve.
    // (The mark is drawn on the icon's tint, the music note hidden.)
    await expect(song.locator('[data-sleeve="icon"] [data-play] svg')).toBeVisible();
    await expect(song.locator('[data-sleeve="icon"] svg.reicon')).toBeHidden();
    await expect(birds.locator('[data-sleeve="image"] img')).toBeVisible();
    const height = (await song.boundingBox())!.height;
    expect(Math.abs(height - 78)).toBeLessThanOrEqual(1);

    // Play: Pause, and the run moves along the track.
    await song.getByRole("button", { name: "Play Song" }).click();
    const pause = song.getByRole("button", { name: "Pause Song" });
    await expect(pause).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await runWidth(song)).toBeGreaterThan(0);

    // Birds starts: Song goes back to Play with its run at 0.
    await birds.getByRole("button", { name: "Play Birds" }).click();
    await expect(song.getByRole("button", { name: "Play Song" })).toBeVisible();
    expect(await runWidth(song)).toBe(0);
    await expect(birds.getByRole("button", { name: "Pause Birds" })).toBeVisible();
    // Its file fails: back to Play, the track disabled, nothing retried.
    await failBirds();
    await expect(birds.getByRole("button", { name: "Play Birds" })).toBeVisible();
    await expect(birds.getByRole("slider", { name: "Seek Birds" })).toBeDisabled();

    // The track seeks by keyboard.
    const slider = song.getByRole("slider", { name: "Seek Song" });
    const before = await slider.getAttribute("aria-valuetext");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).not.toHaveAttribute("aria-valuetext", before ?? "");
  });

  test("the card's ⋯ floats over the bar's corner on hover; the words keep the full width", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    await openHome(page);
    await chooseView(page, "Grid");
    await page.mouse.move(0, 0);

    const song = card(page, "Song");
    const bar = song.locator('[data-face="audio"]');
    const words = song.locator("[data-words]");
    const barBox = (await bar.boundingBox())!;
    const wordsBox = (await words.boundingBox())!;
    // At rest the words run to the bar's margin: no slot kept for the menu.
    expect(Math.abs(barBox.x + barBox.width - 10 - (wordsBox.x + wordsBox.width))).toBeLessThanOrEqual(1);
    // The menu is hidden until the card is hovered (a pointer that hovers).
    const menu = song.locator("[data-card-menu]").filter({
      has: page.getByRole("button", { name: "Open link menu" }),
    });
    await expect(menu).toHaveCSS("opacity", "0");

    await song.hover();
    await expect(menu).toHaveCSS("opacity", "1");
    const button = song.getByRole("button", { name: "Open link menu" });
    const buttonBox = (await button.boundingBox())!;
    // Over the bar's top-right corner, inside it.
    expect(await insideBox(button, bar)).toBe(true);
    expect(barBox.x + barBox.width - (buttonBox.x + buttonBox.width)).toBeLessThanOrEqual(10);
    expect(buttonBox.y - barBox.y).toBeLessThanOrEqual(10);
    // The words don't move.
    const hovered = (await words.boundingBox())!;
    expect(hovered.x).toBeCloseTo(wordsBox.x, 0);
    expect(hovered.width).toBeCloseTo(wordsBox.width, 0);

    // Opened, it keeps the corner.
    await clickAt(page, words);
    await expect(song.locator("[data-expand]")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => bar.evaluate((el: HTMLElement) => el.offsetHeight)).toBe(189);
    await song.hover();
    const openBox = (await button.boundingBox())!;
    expect(openBox.y).toBeCloseTo(buttonBox.y, 0);
    expect(openBox.x).toBeCloseTo(buttonBox.x, 0);
    // Opened, the words (up to two lines) wrap short of it.
    const openWords = (await words.boundingBox())!;
    expect(openWords.x + openWords.width).toBeLessThanOrEqual(openBox.x + 0.5);
    await button.click();
    await expect(page.getByRole("menuitem", { name: "Open file" })).toBeVisible();
    // A press in its menu (a portal, outside the card) isn't outside it.
    await page.getByRole("menuitem", { name: "Copy link" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(song.locator("[data-expand]")).toHaveAttribute("aria-expanded", "true");
    // A press outside the card closes it.
    const cardBox = (await song.boundingBox())!;
    await page.mouse.click(cardBox.x + cardBox.width + 200, cardBox.y + 40);
    await expect(song.locator("[data-expand]")).toHaveAttribute("aria-expanded", "false");
  });

  test("the hover preview's bar and the card's are one playback", async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    await openHome(page);

    await row(page, "Song").hover();
    const preview = page.locator('[data-slot="hover-card-content"] [data-face="audio"]');
    await expect(preview).toBeVisible();
    // The preview's bar doesn't expand: no opener.
    await expect(preview.locator("[data-expand]")).toHaveCount(0);
    // The same bar: the full second line, the sleeve is the play control.
    expect(await secondLine(preview)).toBe("Audio · 2:36");
    const previewPlay = preview.getByRole("button", { name: "Play Song" });
    expect(
      await previewPlay.evaluate(
        (el) => el.hasAttribute("data-play") && el.closest("[data-sleeve]") !== null,
      ),
    ).toBe(true);
    expect(await previewPlay.evaluate((el) => el.getBoundingClientRect().width)).toBe(40);
    await previewPlay.click();
    await expect(preview.getByRole("button", { name: "Pause Song" })).toBeVisible();

    // Closing the preview (the pointer leaves for the menu) keeps it playing.
    await chooseView(page, "Grid");
    await expect(card(page, "Song").getByRole("button", { name: "Pause Song" })).toBeVisible();
    expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(1);
    await expect
      .poll(() => page.evaluate(() => document.querySelector("audio")?.paused))
      .toBe(false);
  });

  test("an audio file uploading is the bar's shape, with the ring where play sits", async ({
    page,
    seed,
  }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    await chooseView(page, "Grid");
    // The token request waits until the test answers it with the limit.
    const tokenRequests: Route[] = [];
    await page.route("**/api/uploads/token", (route) => {
      tokenRequests.push(route);
    });
    const refuse = async () => {
      await expect.poll(() => tokenRequests.length).toBeGreaterThan(0);
      for (const route of tokenRequests) {
        await route
          .fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Your 250 MB of storage is full.",
              code: "LIMIT_REACHED",
              feature: "STORAGE_LIMIT",
            }),
          })
          .catch(() => {});
      }
    };
    // The page's file input (what the + menu and `U` open).
    await page
      .locator('[data-cy="upload-input"]')
      .setInputFiles({ name: "tune.wav", mimeType: "audio/wav", buffer: silentWav(1) });

    const item = page.locator('[data-cy="pending-upload"]');
    await expect(item).toHaveAttribute("data-status", "uploading");
    // The ring where the play mark will be: on the sleeve.
    await expect(item.locator('[data-sleeve="icon"] > span svg')).toBeVisible();
    await expect(item).toContainText("tune");
    await expect(item).toContainText("Uploading…");
    const height = (await item.boundingBox())!.height;
    expect(Math.abs(height - 78)).toBeLessThanOrEqual(1);

    await refuse();
    await expect(item).toHaveAttribute("data-status", "failed");
    await expect(item.getByRole("button", { name: "Retry uploading tune.wav" })).toBeVisible();
    await expect(item.getByRole("button", { name: "Dismiss tune.wav" })).toBeVisible();
  });
});

test.describe("Audio pearls on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the phone grid's bar: the sleeve plays, the length, a truncated title, the menu", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seed.link({
      url: "https://birds.example/birds.mp3",
      title: "Birds",
      contentType: "AUDIO",
      duration: 30,
    });
    await seedSong(seed, "Song for a long drive home");
    // The grid, saved on the account before the page loads.
    const saved = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(saved.ok()).toBe(true);
    await openHome(page);

    const song = cards(page).filter({ hasText: "Song for a long drive home" });
    expect((await song.boundingBox())!.width).toBeLessThanOrEqual(175);
    // Under 200px a link's second line stays its domain.
    expect(await secondLine(cards(page).filter({ hasText: "Birds" }))).toBe("birds.example");
    const title = song.locator("[data-words] > :first-child");
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await secondLine(song)).toBe("2:36");
    await expect(song.getByRole("button", { name: "Open link menu" })).toBeVisible();

    // The sleeve is play: 40px, 44px to the touch.
    const play = song.getByRole("button", { name: "Play Song for a long drive home" });
    const target = await play.evaluate((b) => {
      const box = b.getBoundingClientRect();
      const hit = getComputedStyle(b, "::after");
      return {
        sleeve: b.closest("[data-sleeve]") !== null && b.hasAttribute("data-play"),
        w: box.width,
        h: box.height,
        top: parseFloat(hit.top),
        left: parseFloat(hit.left),
      };
    });
    expect(target.sleeve).toBe(true);
    expect(target.w).toBe(40);
    expect(target.w - 2 * target.left).toBeGreaterThanOrEqual(44);
    expect(target.h - 2 * target.top).toBeGreaterThanOrEqual(44);

    // A tap on the sleeve plays, and selects nothing.
    await play.tap();
    await expect(
      song.getByRole("button", { name: "Pause Song for a long drive home" }),
    ).toBeVisible();
    await expect(page.getByText("1 selected")).toHaveCount(0);
    await expect(song).not.toHaveAttribute("data-selected", "true");
  });

  test("a tap on the bar's words opens it; shut, the whole bar is its opener", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    const saved = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(saved.ok()).toBe(true);
    await openHome(page);

    const song = card(page, "Song");
    const opener = song.locator("[data-expand]");
    const barBox = (await song.locator('[data-face="audio"]').boundingBox())!;
    const openerBox = (await opener.boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(openerBox[key] - barBox[key])).toBeLessThanOrEqual(0.5);
    }
    const words = (await song.locator("[data-words]").boundingBox())!;
    await page.touchscreen.tap(words.x + words.width / 2, words.y + 4);
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() => song.locator('[data-face="audio"]').evaluate((el: HTMLElement) => el.offsetHeight))
      .toBe(189);
    await expect(page.getByText("1 selected")).toHaveCount(0);
    // The transport fits the phone's card.
    const play = (await song.getByRole("button", { name: "Play Song", exact: true }).boundingBox())!;
    const cardBox = (await song.boundingBox())!;
    expect(play.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(play.x + play.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  });
});

/** Two audio pearls side by side (Sun, Tide) and an image card under Sun. */
async function seedExpandGrid(seed: Seed, baseURL: string | undefined) {
  // Oldest first: the grid shows the newest first (Sun, Tide, then Shot).
  await seed.link({
    url: "https://shots.example/shot.png",
    title: "Shot",
    contentType: "IMAGE",
    thumbnail: `${baseURL}/icon.png`,
    width: 800,
    height: 600,
  });
  for (const title of ["Tide", "Sun"]) {
    // Distinct creation times, so the order (and the columns) never swap.
    await new Promise((resolve) => setTimeout(resolve, 15));
    await seed.link({
      url: `https://sounds.example/${title.toLowerCase()}.wav`,
      title,
      contentType: "AUDIO",
      duration: 10,
    });
  }
}

type GrowthSample = { height: number; drawn: number; below: number; swell: string };

/**
 * Records the bar's layout height (`offsetHeight`; `drawn` includes the
 * close's swell) and the top of the card marked `data-e2e-below`, each time
 * the bar's box changes (a ResizeObserver: after layout, before paint, so
 * once per drawn frame, after the masonry's own observer has placed the
 * cards). The first entry is the bar before the move.
 */
async function startGrowthSampling(bar: Locator) {
  // Resolves once the first entry (the bar before the move) is in.
  await bar.evaluate((el: HTMLElement) => new Promise<void>((ready) => {
    const below = document.querySelector("[data-e2e-below]");
    const card = el.closest('[data-cy="link-card"]')!;
    const seen: GrowthSample[] = [];
    const observer = new ResizeObserver(() => {
      seen.push({
        height: el.offsetHeight,
        drawn: el.getBoundingClientRect().height,
        below: below ? below.getBoundingClientRect().top : NaN,
        swell: getComputedStyle(card).transform,
      });
      if (seen.length === 1) ready();
    });
    observer.observe(el);
    Object.assign(window, {
      e2eGrowth: seen,
      e2eStopGrowth: () => observer.disconnect(),
    });
  }));
}

async function stopGrowthSampling(page: Page, settledHeight: number) {
  await expect
    .poll(() =>
      page.evaluate((settled) => {
        const seen = (window as unknown as { e2eGrowth: GrowthSample[] }).e2eGrowth;
        return seen.length > 1 && Math.abs(seen.at(-1)!.height - settled) <= 2;
      }, settledHeight),
    )
    .toBe(true);
  // A frame or two for anything still settling (the last sample is the end).
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const w = window as unknown as { e2eGrowth: GrowthSample[]; e2eStopGrowth: () => void };
    w.e2eStopGrowth();
    return w.e2eGrowth;
  });
}

const bar = (scope: Locator) => scope.locator('[data-face="audio"]');
const expandButton = (scope: Locator) => scope.locator("[data-expand]");

async function expectShut(scope: Locator, title: string) {
  await expect(expandButton(scope)).toHaveAttribute("aria-expanded", "false");
  await expect(expandButton(scope)).toHaveAttribute("aria-label", `Expand ${title}`);
  await expect.poll(() => bar(scope).evaluate((el: HTMLElement) => el.offsetHeight)).toBe(78);
}

async function expectOpen(scope: Locator, title: string) {
  await expect(expandButton(scope)).toHaveAttribute("aria-expanded", "true");
  await expect(expandButton(scope)).toHaveAttribute("aria-label", `Collapse ${title}`);
  await expect.poll(() => bar(scope).evaluate((el: HTMLElement) => el.offsetHeight)).toBe(189);
}

test.describe("Audio pearls: the bar expands in place", () => {
  // Two columns of cards (under 640px), so the image sits under Sun.
  test.use({ viewport: { width: 600, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
  });

  test("a press on the bar grows it into the player, and the grid follows it", async ({
    page,
    seed,
    baseURL,
  }) => {
    await seedExpandGrid(seed, baseURL);
    await openHome(page);
    await chooseView(page, "Grid");
    const sun = card(page, "Sun");
    const tide = card(page, "Tide");
    const shot = card(page, "Shot");
    await expect(shot).toBeVisible();
    // The image sits under Sun.
    const sunBox = (await sun.boundingBox())!;
    const shotBox = (await shot.boundingBox())!;
    expect(Math.abs(shotBox.x - sunBox.x)).toBeLessThanOrEqual(1);
    expect(shotBox.y).toBeGreaterThan(sunBox.y + sunBox.height);
    await shot.evaluate((el) => el.setAttribute("data-e2e-below", ""));
    await expectShut(sun, "Sun");
    // Shut, the transport isn't there for focus or clicks.
    await expect(sun.getByRole("button", { name: "Restart Sun" })).toHaveCount(0);

    // A press on the words (away from the controls) opens it.
    await startGrowthSampling(bar(sun));
    await clickAt(page, sun.locator("[data-words]"));
    const growth = await stopGrowthSampling(page, 189);
    await expectOpen(sun, "Sun");
    expect(Math.abs(growth[0].height - 78)).toBeLessThanOrEqual(1);
    expect(Math.abs(growth.at(-1)!.height - 189)).toBeLessThanOrEqual(2);
    // It grew over several frames, never back.
    expect(growth.length).toBeGreaterThan(4);
    for (let i = 1; i < growth.length; i++) {
      expect(growth[i].height).toBeGreaterThanOrEqual(growth[i - 1].height);
    }
    // The image under it moved down with it, frame by frame (no jump), by
    // the growth: 111px.
    for (const sample of growth) {
      expect(
        Math.abs(sample.below - growth[0].below - (sample.height - growth[0].height)),
      ).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(growth.at(-1)!.below - growth[0].below - 111)).toBeLessThanOrEqual(3);

    // The transport: Restart, Play, Open file. Play takes over from the
    // sleeve, whose mark is gone.
    const play = sun.getByRole("button", { name: "Play Sun", exact: true });
    await expect(play).toHaveCount(1);
    await expect(play).toBeVisible();
    expect(await play.evaluate((el) => el.closest("[data-sleeve]") === null)).toBe(true);
    await expect(sun.getByRole("link", { name: "Open file" })).toBeVisible();
    const restart = sun.getByRole("button", { name: "Restart Sun" });
    await expect(restart).toBeVisible();
    await expect(restart).toBeDisabled();
    await expect(sun.locator("[data-times]")).toContainText("0:00");
    await expect(sun.locator("[data-times]")).toContainText("−0:10");
    expect(
      await sun
        .locator("[data-sleeve] [data-play] [data-mark]")
        .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe("0");
    await play.click();
    await expect(sun.getByRole("button", { name: "Pause Sun", exact: true })).toBeVisible();
    await expect(restart).toBeEnabled();
    await restart.click();
    await expect(sun.getByRole("button", { name: "Pause Sun", exact: true })).toBeVisible();
    // Still open: the controls don't collapse it.
    await expectOpen(sun, "Sun");

    // Another pearl opens: this one closes (one at a time), still playing.
    await clickAt(page, tide.locator("[data-words]"));
    await expectOpen(tide, "Tide");
    await expectShut(sun, "Sun");
    await expect(sun.getByRole("button", { name: "Pause Sun", exact: true })).toBeVisible();
    await expect
      .poll(async () => (await shot.boundingBox())!.y)
      .toBeCloseTo(shotBox.y, 0);

    // Esc collapses it.
    await page.keyboard.press("Escape");
    await expectShut(tide, "Tide");

    // A press outside the card collapses it; the press that opened it didn't.
    await clickAt(page, sun.locator("[data-words]"));
    await expectOpen(sun, "Sun");
    const grid = (await page.getByRole("list", { name: "Links" }).boundingBox())!;
    await page.mouse.click(grid.x - 8 > 0 ? grid.x - 8 : 4, sunBox.y + 30);
    await expectShut(sun, "Sun");

    // A press on the opened sleeve-and-words row collapses it too.
    await clickAt(page, sun.locator("[data-words]"));
    await expectOpen(sun, "Sun");
    await clickAt(page, sun.locator("[data-words]"));
    await expectShut(sun, "Sun");
  });

  test("Esc closes it: the bar shrinks back to 78, the card dips on the way, the grid follows", async ({
    page,
    seed,
    baseURL,
  }) => {
    await seedExpandGrid(seed, baseURL);
    await openHome(page);
    await chooseView(page, "Grid");
    const sun = card(page, "Sun");
    const shot = card(page, "Shot");
    await expect(shot).toBeVisible();
    const shotTop = (await shot.boundingBox())!.y;
    await shot.evaluate((el) => el.setAttribute("data-e2e-below", ""));
    await clickAt(page, sun.locator("[data-words]"));
    await expectOpen(sun, "Sun");
    // At rest, open: no transform on the card.
    expect(await sun.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

    await startGrowthSampling(bar(sun));
    await page.keyboard.press("Escape");
    const shrink = await stopGrowthSampling(page, 78);
    await expectShut(sun, "Sun");
    expect(Math.abs(shrink[0].height - 189)).toBeLessThanOrEqual(1);
    expect(shrink.length).toBeGreaterThan(4);
    for (let i = 1; i < shrink.length; i++) {
      expect(shrink[i].height).toBeLessThanOrEqual(shrink[i - 1].height);
    }
    expect(Math.abs(shrink.at(-1)!.height - 78)).toBeLessThanOrEqual(1);
    // The image under it comes back up with it, frame by frame.
    for (const sample of shrink) {
      expect(
        Math.abs(sample.below - shrink[0].below - (sample.height - shrink[0].height)),
      ).toBeLessThanOrEqual(2);
    }
    expect(Math.abs((await shot.boundingBox())!.y - shotTop)).toBeLessThanOrEqual(1);
    // The swell is the card's: a scale under 1 on some frame mid-close,
    // and none once it has landed.
    const scales = shrink
      .map((sample) => sample.swell)
      .filter((swell) => swell !== "none")
      .map((swell) => Number(/matrix\(([^,]+),/.exec(swell)?.[1]));
    expect(scales.length).toBeGreaterThan(0);
    expect(Math.min(...scales)).toBeLessThan(0.99);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.964);
    await expect.poll(() => sun.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("opened, a long title takes two lines beside the sleeve; shut, one", async ({
    page,
    seed,
  }) => {
    await seed.link({
      url: "https://sounds.example/long.wav",
      title: "A very long title for a recording of the tide coming in at dawn",
      contentType: "AUDIO",
      duration: 10,
    });
    await openHome(page);
    await chooseView(page, "Grid");
    const long = cards(page).filter({ has: page.locator('[data-face="audio"]') });
    const title = long.locator("[data-words] > :first-child");
    const lines = () =>
      title.evaluate((el) => {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        return Math.round(el.clientHeight / lineHeight);
      });
    expect(await lines()).toBe(1);
    await clickAt(page, long.locator("[data-words]"));
    await expect
      .poll(() => bar(long).evaluate((el: HTMLElement) => el.offsetHeight))
      .toBe(189);
    expect(await lines()).toBe(2);
    expect(await title.evaluate((el) => el.clientHeight)).toBeCloseTo(38, 0);
    // The words still fit beside the sleeve.
    expect(await insideBox(title, long.locator("[data-words]"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect
      .poll(() => bar(long).evaluate((el: HTMLElement) => el.offsetHeight))
      .toBe(78);
    expect(await lines()).toBe(1);
  });

  test("by keyboard: the bar's opener, Esc back to it", async ({ page, seed, baseURL }) => {
    await seedExpandGrid(seed, baseURL);
    await openHome(page);
    await chooseView(page, "Grid");
    const sun = card(page, "Sun");
    const opener = sun.getByRole("button", { name: "Expand Sun" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expectOpen(sun, "Sun");
    // Into the transport, then Esc: shut, focus back on the opener.
    await sun.getByRole("button", { name: "Play Sun", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expectShut(sun, "Sun");
    await expect(sun.getByRole("button", { name: "Expand Sun" })).toBeFocused();
  });
});

/** A row's second line (under its title), as shown. */
function rowSecondLine(scope: Locator) {
  return scope
    .locator('[data-slot="item-title"] > :nth-child(2)')
    .evaluate((el) => (el as HTMLElement).innerText.trim());
}

/** The audio row's main element: the button that plays and pauses it. */
const rowToggle = (scope: Locator) => scope.locator("[data-audio-toggle]");
/** The play/pause mark drawn in the icon slot while the pearl is loaded. */
const rowMark = (scope: Locator) => scope.locator('[data-cy="row-favicon"] [data-row-mark]');

test.describe("Audio pearls in the list: a row that plays", () => {
  test.beforeEach(async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    // Newest first: Alpha, Song, then Bravo under it.
    await seed.link({ url: "https://bravo.example", title: "Bravo" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await seedSong(seed);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
  });

  test("an audio row is a row: a click plays and pauses it, the mark shows at its end, Esc does nothing", async ({
    page,
  }) => {
    await openHome(page);
    const song = row(page, "Song");
    const alpha = row(page, "Alpha");
    // A normal row: 48px, its icon, its title and "Audio · 2:36"; no bar.
    expect(Math.abs((await song.boundingBox())!.height - 48)).toBeLessThanOrEqual(1);
    expect((await song.boundingBox())!.height).toBe((await alpha.boundingBox())!.height);
    await expect(song.locator('[data-face="audio"]')).toHaveCount(0);
    await expect(song.locator('[data-cy="row-favicon"]')).toBeVisible();
    expect(await rowSecondLine(song)).toBe("Audio · 2:36");
    // Its main element is a button that plays it: never a link.
    await expect(song.getByRole("link")).toHaveCount(0);
    await expect(rowToggle(song)).toHaveAttribute("aria-label", "Play Song");
    await expect(rowToggle(song)).toHaveJSProperty("tagName", "BUTTON");
    await expect(rowMark(song)).toHaveCount(0);

    // A click on the row plays it: the icon slot draws the mark (the pause
    // shape while playing), and the second line counts.
    await clickAt(page, song.locator('[data-slot="item-title"]'));
    await expect(rowToggle(song)).toHaveAttribute("aria-label", "Pause Song");
    await expect(rowMark(song)).toHaveAttribute("data-row-mark", "pause");
    await page.mouse.move(0, 0);
    await expect(rowMark(song)).toBeVisible();
    // In the icon's place, at its size; one button per row.
    // (Its layout size: the slot's own scale may still be easing back.)
    expect(await rowMark(song).evaluate((el: HTMLElement) => el.offsetWidth)).toBe(20);
    expect(await insideBox(rowMark(song), song.locator('[data-cy="row-favicon"]'))).toBe(true);
    await expect(song.locator('[data-cy="row-favicon"] svg.reicon')).toHaveCount(0);
    await expect(song.getByRole("button", { name: "Pause Song" })).toHaveCount(1);
    await expect.poll(() => rowSecondLine(song)).toMatch(/^0:0\d \/ (2:36|0:10)$/);
    // The `⋯` stays exactly as on other rows: hidden at rest with a pointer,
    // over the row's end on hover; the checkbox takes the icon slot on hover.
    const menuButton = song.getByRole("button", { name: "Open link menu" });
    expect(
      await menuButton.evaluate((el) => {
        let node: Element | null = el;
        let opacity = 1;
        while (node) {
          opacity *= Number(getComputedStyle(node).opacity);
          node = node.parentElement;
        }
        return opacity;
      }),
    ).toBe(0);
    await song.hover();
    await expect(menuButton).toBeVisible();
    const songBox = (await song.boundingBox())!;
    const menuBox = (await menuButton.boundingBox())!;
    expect(songBox.x + songBox.width - (menuBox.x + menuBox.width)).toBeLessThanOrEqual(12);
    await expect(song.getByRole("checkbox", { name: "Select Song" })).toHaveCSS("opacity", "1");
    await expect(song.locator('[data-cy="row-favicon"]')).toHaveCSS("opacity", "0");
    await page.mouse.move(0, 0);
    expect(Math.abs(songBox.height - 48)).toBeLessThanOrEqual(1);
    // Nothing opens.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).not.toContain("pearl");

    // Esc does nothing: it plays on.
    await page.keyboard.press("Escape");
    await expect(rowToggle(song)).toHaveAttribute("aria-label", "Pause Song");
    await expect
      .poll(() => page.evaluate(() => document.querySelector("audio")?.paused))
      .toBe(false);

    // A second click pauses it; the mark stays (the play shape) while it's
    // paused.
    await clickAt(page, song.locator('[data-slot="item-title"]'));
    await expect(rowToggle(song)).toHaveAttribute("aria-label", "Play Song");
    await expect(rowMark(song)).toHaveAttribute("data-row-mark", "play");
    await page.mouse.move(0, 0);
    await expect(rowMark(song)).toBeVisible();
  });

  test("the checkbox swaps in on hover and the ⋯ floats, as on other rows", async ({ page }) => {
    await openHome(page);
    const song = row(page, "Song");
    const checkbox = song.getByRole("checkbox", { name: "Select Song" });
    // On hover, in the icon's place; at rest, hidden.
    await expect(checkbox).toHaveCSS("opacity", "0");
    await song.hover();
    await expect(checkbox).toHaveCSS("opacity", "1");
    await expect(song.locator('[data-cy="row-favicon"]')).toHaveCSS("opacity", "0");
    // The menu floats over the row's end, on hover.
    const menuButton = song.getByRole("button", { name: "Open link menu" });
    await expect(menuButton).toBeVisible();
    const menuBox = (await menuButton.boundingBox())!;
    const songBox = (await song.boundingBox())!;
    expect(songBox.x + songBox.width - (menuBox.x + menuBox.width)).toBeLessThanOrEqual(12);
    await menuButton.click();
    await expect(page.getByRole("menuitem", { name: "Open file" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await song.hover();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(song).toHaveAttribute("data-selected", "true");
    // While selecting, a click on the row toggles it; it doesn't play.
    await clickAt(page, song.locator('[data-slot="item-title"]'));
    await expect(checkbox).not.toBeChecked();
    await expect(rowToggle(song)).toHaveAttribute("aria-label", "Play Song");
    await expect(rowMark(song)).toHaveCount(0);
  });

  test("by keyboard: Tab reaches its button, which previews; Enter plays; a delete moves focus to it", async ({
    page,
    browserName,
  }) => {
    // WebKit's Tab skips buttons; Option-Tab doesn't.
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await openHome(page);
    const song = row(page, "Song");
    const button = rowToggle(song);
    await page.getByRole("link", { name: "Alpha (opens in new tab)" }).focus();
    for (let i = 0; i < 6; i++) {
      if (await button.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press(tab);
    }
    await expect(button).toBeFocused();
    // Keyboard focus opens the hover preview, as on other rows: its bar
    // doesn't expand.
    const preview = page.locator('[data-slot="hover-card-content"]');
    await expect(preview.locator('[data-face="audio"]')).toBeVisible();
    await expect(preview.locator("[data-expand]")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-label", "Pause Song");
    await expect(preview.getByRole("button", { name: "Pause Song" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-label", "Play Song");

    // Alpha, deleted from its menu by keyboard: focus lands on Song's button.
    const alpha = row(page, "Alpha");
    await alpha.hover();
    await alpha.getByRole("button", { name: "Open link menu" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    await expect(alpha).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-audio-toggle")))
      .toBe(true);
  });
});

test.describe("Audio pearls: the bar expands at once with reduced motion", () => {
  test.use({ viewport: { width: 600, height: 900 }, reducedMotion: "reduce" });

  test("no frames between the bar and the player", async ({ page, seed, baseURL }) => {
    await seedExpandGrid(seed, baseURL);
    await openHome(page);
    await chooseView(page, "Grid");
    const sun = card(page, "Sun");
    await card(page, "Shot").evaluate((el) => el.setAttribute("data-e2e-below", ""));
    await startGrowthSampling(bar(sun));
    await clickAt(page, sun.locator("[data-words]"));
    const growth = await stopGrowthSampling(page, 189);
    await expectOpen(sun, "Sun");
    // 78, then 189: nothing in between.
    for (const sample of growth) {
      expect(
        Math.abs(sample.height - 78) <= 1 || Math.abs(sample.height - 189) <= 1,
      ).toBe(true);
    }
    // The transport fades in (150ms) and is there.
    await expect(sun.getByRole("button", { name: "Restart Sun" })).toBeVisible();
    await expect
      .poll(() =>
        sun
          .getByRole("button", { name: "Play Sun", exact: true })
          .evaluate((el) => {
            let node: Element | null = el;
            let opacity = 1;
            while (node) {
              opacity *= Number(getComputedStyle(node).opacity);
              node = node.parentElement;
            }
            return opacity;
          }),
      )
      .toBe(1);
  });
});
