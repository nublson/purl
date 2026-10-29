import type { Locator, Page, Route } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import type { seedLink } from "./support/db";
import { silentWav } from "./support/media";

// Image, video and audio pearls show the media itself: the grid card is the
// image or the video (no title strip), audio is a player card (hero,
// title, second line, track, times, transport), and a list row's favicon
// slot is the image's preview.

const cards = (page: Page) => page.locator('[data-cy="link-card"]');
// A page's card is a link; an image or video pearl's card opens the viewer
// (a button); an audio pearl's card is its player (found by its track,
// whose name never changes).
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

/** The header's List / Grid switch, waiting for the choice to be saved. */
async function chooseView(page: Page, view: "List" | "Grid") {
  const saved = page.waitForResponse(
    (res) => res.url().endsWith("/api/user/layout") && res.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: `${view} view` }).click();
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
 * A real click at `target`'s centre, wherever it lands: an audio card's
 * words take no pointer events of their own (the card's surface lies under
 * them).
 */
async function clickAt(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("no box to click");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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

  test("while selecting, a click on the player card selects it; its controls step aside", async ({
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

    // Find the card by its player.
    const song = cards(page).filter({ has: page.locator('[data-face="audio"]') });
    const checkbox = song.getByRole("checkbox", { name: "Select Song" });
    await expect(checkbox).toBeVisible();

    // A click on the hero, away from its controls, selects it.
    await clickAt(page, song.locator("[data-hero]"));
    await expect(checkbox).toBeChecked();

    // The controls step aside: out of reach of focus and clicks.
    const play = song.locator('button[data-play][aria-label="Play Song"]');
    expect(
      await play.evaluate((el: HTMLElement) => {
        el.focus();
        return document.activeElement === el;
      }),
    ).toBe(false);
    // A click where the Play button sits toggles the card, not playback.
    const box = await play.boundingBox();
    if (!box) throw new Error("no Play button box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(checkbox).not.toBeChecked();
    await expect(play).toHaveAttribute("aria-label", "Play Song");
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

  test("a shared folder's grid shows the media; an audio card plays in place", async ({
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

    // An audio card's opener, like every card's, is named by its title; it
    // plays in place (pressed while playing), never the media viewer.
    const songCard = cards(page).filter({ has: page.locator('[data-face="audio"]') });
    await expect(sharedCard("Song")).toHaveAttribute("aria-pressed", "false");
    let popups = 0;
    page.on("popup", () => popups++);
    const url = page.url();
    await expect(songCard).toContainText("sounds.example");
    await songCard.getByRole("button", { name: "Play Song" }).click();
    // The file fails here, so it comes back to Play; nothing opened.
    await expect(songCard.getByRole("button", { name: "Play Song" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(popups).toBe(0);
    expect(page.url()).toBe(url);
    // A visitor reaches the file from the transport: a real link.
    const openFile = songCard.getByRole("link", { name: "Open file" });
    await expect(openFile).toBeVisible();
    await expect(openFile).toHaveAttribute("href", "https://sounds.example/song.mp3");
    await expect(openFile).toHaveAttribute("target", "_blank");
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

test.describe("Audio pearls: the grid card is the player card", () => {
  test("the hero, the title over the fade, the track, the times and the transport; one plays at a time; a file that won't load goes back to Play", async ({
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
    // Like every card, it has an opener under the whole card, named by its
    // title: here it plays and pauses (pressed while playing), never a
    // viewer or a new tab (Open file is the transport's link).
    await expect(song.getByRole("button", { name: "Song", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(song.getByRole("link")).toHaveCount(1);
    await expect(song.getByRole("link", { name: "Open file" })).toHaveAttribute(
      "href",
      "https://sounds.example/song.wav",
    );
    // No preview image: the icon hero, 180px tall; Birds' page image is its hero.
    const iconHero = song.locator('[data-hero="icon"]');
    await expect(iconHero).toBeVisible();
    expect(Math.abs((await iconHero.boundingBox())!.height - 180)).toBeLessThanOrEqual(0.5);
    await expect(birds.locator('img[data-hero="image"]')).toBeVisible();
    // An upload has no second line (the times row says how long); a
    // link's is its domain.
    await expect(song).not.toContainText("Audio ·");
    await expect(birds).toContainText("birds.example");
    await expect(song.locator("[data-times] [data-elapsed]")).toHaveText("0:00");
    await expect(song.locator("[data-times] [data-length]")).toHaveText("2:36");
    await expect(song.getByRole("button", { name: "Restart Song" })).toBeDisabled();
    // The name says what a press does; no `aria-pressed` on top of it.
    await expect(song.getByRole("button", { name: "Play Song" })).not.toHaveAttribute(
      "aria-pressed",
    );

    // Play: Pause, and the run moves along the track.
    await song.getByRole("button", { name: "Play Song" }).click();
    await expect(song.getByRole("button", { name: "Pause Song" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await runWidth(song)).toBeGreaterThan(0);
    await expect(song.getByRole("button", { name: "Restart Song" })).toBeEnabled();

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

  test("the checkbox and the ⋯ sit in the hero's corners on hover, as on every card", async ({
    page,
    seed,
  }) => {
    await seedSong(seed);
    await openHome(page);
    await chooseView(page, "Grid");
    await page.mouse.move(0, 0);

    const song = card(page, "Song");
    const hero = song.locator("[data-hero]");
    const menu = song.locator("[data-card-menu]").filter({
      has: page.getByRole("button", { name: "Open link menu" }),
    });
    const checkbox = song.getByRole("checkbox", { name: "Select Song" });
    await expect(menu).toHaveCSS("opacity", "0");
    await expect(checkbox).toHaveCSS("opacity", "0");

    await song.hover();
    await expect(menu).toHaveCSS("opacity", "1");
    await expect(checkbox).toHaveCSS("opacity", "1");
    expect(await insideBox(song.getByRole("button", { name: "Open link menu" }), hero)).toBe(true);
    expect(await insideBox(checkbox, hero)).toBe(true);
    await song.getByRole("button", { name: "Open link menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Open file" })).toBeVisible();
  });

  test("a press on the hero plays and pauses; while it plays the bars hold the checkbox's corner", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    await openHome(page);
    await chooseView(page, "Grid");

    const song = card(page, "Song");
    const bars = song.locator("[data-playing]");
    await expect(bars).toHaveCount(0);
    await clickAt(page, song.locator("[data-hero]"));
    await expect(song.getByRole("button", { name: "Pause Song" })).toBeVisible();
    await expect(bars).toBeVisible();
    // The card's opener says it's playing, and is its first focus stop.
    await expect(song.getByRole("button", { name: "Song", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const first = await song.evaluate(
      (el) => el.querySelector("button, a[href], input")?.hasAttribute("data-audio-open") ?? false,
    );
    expect(first).toBe(true);
    // Bars have no action: on hover the checkbox takes the corner.
    await page.mouse.move(0, 0);
    await expect(bars).toHaveCSS("opacity", "1");
    // The checkbox's own box, so the swap doesn't move or resize the corner.
    const tile = (await bars.boundingBox())!;
    const box = (await song.getByRole("checkbox", { name: "Select Song" }).boundingBox())!;
    expect(Math.abs(tile.x - box.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tile.y - box.y)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tile.width - box.width)).toBeLessThanOrEqual(0.5);
    const hero = (await song.locator("[data-hero]").boundingBox())!;
    await page.mouse.move(hero.x + hero.width / 2, hero.y + hero.height / 2);
    await expect(bars).toHaveCSS("opacity", "0");
    await expect(song.getByRole("checkbox", { name: "Select Song" })).toHaveCSS("opacity", "1");

    await clickAt(page, song.locator("[data-hero]"));
    await expect(song.getByRole("button", { name: "Play Song" })).toBeVisible();
    await expect(bars).toHaveCount(0);
  });

  test("the whole of each transport button takes the pointer, not only its icon", async ({
    page,
    seed,
  }) => {
    await seedSong(seed);
    await openHome(page);
    await chooseView(page, "Grid");
    const song = card(page, "Song");
    // The owner's card lays a select surface over the whole card: every
    // control must paint above it, across its full circle.
    const misses = await song.evaluate((el) =>
      Array.from(el.querySelectorAll<HTMLElement>("[data-transport] > *")).map((button) => {
        const r = button.getBoundingClientRect();
        let miss = 0;
        for (let y = r.top + 2; y < r.bottom - 2; y += 3) {
          for (let x = r.left + 2; x < r.right - 2; x += 3) {
            const dx = x - (r.left + r.width / 2);
            const dy = y - (r.top + r.height / 2);
            if (dx * dx + dy * dy > (r.width / 2 - 2) ** 2) continue;
            const hit = document.elementFromPoint(x, y);
            if (!hit || !button.contains(hit)) miss++;
          }
        }
        return miss;
      }),
    );
    expect(misses).toEqual([0, 0, 0]);
  });

  test("the hover preview and the card are one playback", async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    await openHome(page);

    await row(page, "Song").hover();
    const preview = audioPreview(page);
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Play Song" }).click();
    await expect(preview.getByRole("button", { name: "Pause Song" })).toBeVisible();

    // Closing the preview (the pointer leaves for the menu) keeps it playing.
    await chooseView(page, "Grid");
    await expect(card(page, "Song").getByRole("button", { name: "Pause Song" })).toBeVisible();
    expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(1);
    await expect
      .poll(() => page.evaluate(() => document.querySelector("audio")?.paused))
      .toBe(false);
  });

  test("an audio file uploading is the player's shape, with the ring on the hero", async ({
    page,
    seed,
  }) => {
    await seedSong(seed);
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
    await expect(item.locator('[data-hero="icon"] svg')).toBeVisible();
    await expect(item).toContainText("tune");
    await expect(item).toContainText("Uploading…");
    // The pearl's own height, so it takes the slot without a jump.
    const saved = (await card(page, "Song").boundingBox())!.height;
    expect(Math.abs((await item.boundingBox())!.height - saved)).toBeLessThanOrEqual(1);

    await refuse();
    await expect(item).toHaveAttribute("data-status", "failed");
    await expect(item.getByRole("button", { name: "Retry uploading tune.wav" })).toBeVisible();
    await expect(item.getByRole("button", { name: "Dismiss tune.wav" })).toBeVisible();
  });
});

test.describe("Audio pearls on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the phone grid's player card: Play plays and selects nothing; the menu shows", async ({
    page,
    seed,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed, "Song for a long drive home");
    // The grid, saved on the account before the page loads.
    const saved = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(saved.ok()).toBe(true);
    await openHome(page);

    const song = cards(page).filter({ hasText: "Song for a long drive home" });
    const box = (await song.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(175);
    // Under 200px the player is a cover tile: square, Play alone in the
    // corner, the length as its second line, no times row or seek control.
    expect(Math.abs(box.height - box.width)).toBeLessThanOrEqual(1);
    await expect(song.getByRole("button", { name: /^Restart/ })).toBeHidden();
    await expect(song.getByRole("link", { name: "Open file" })).toBeHidden();
    await expect(song.getByRole("slider")).toBeHidden();
    await expect(song.locator("[data-times]")).toBeHidden();
    await expect(song).toContainText("2:36");
    const play = (await song.locator("[data-play]").boundingBox())!;
    expect(box.x + box.width - (play.x + play.width)).toBeLessThanOrEqual(12);
    expect(box.y + box.height - (play.y + play.height)).toBeLessThanOrEqual(16);
    await expect(song.getByRole("button", { name: "Open link menu" })).toBeVisible();
    await song.getByRole("button", { name: "Play Song for a long drive home" }).tap();
    await expect(
      song.getByRole("button", { name: "Pause Song for a long drive home" }),
    ).toBeVisible();
    await expect(page.getByText("1 selected")).toHaveCount(0);
    await expect(song).not.toHaveAttribute("data-selected", "true");

    // The playing bars hold the corner and do nothing: a tap on them
    // selects nothing (a long-press still does).
    const bars = (await song.locator("[data-playing]").boundingBox())!;
    await page.touchscreen.tap(bars.x + bars.width / 2, bars.y + bars.height / 2);
    await expect(page.getByText("1 selected")).toHaveCount(0);
    await expect(song).not.toHaveAttribute("data-selected", "true");
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
/** The icon slot while the pearl is loaded: the playing bars, or the play mark while paused. */
const rowMark = (scope: Locator) => scope.locator('[data-cy="row-favicon"] [data-row-mark]');

test.describe("Audio pearls on a phone: the tile's menu", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tapping the ⋯, or the art to close its menu, plays nothing", async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    const saved = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(saved.ok()).toBe(true);
    await openHome(page);

    const song = card(page, "Song");
    // The menu opens on the press; the tap's click then lands on whatever
    // under the finger still takes pointer events. It must not be the art.
    const menu = (await song.getByRole("button", { name: "Open link menu" }).boundingBox())!;
    await page.touchscreen.tap(menu.x + menu.width / 2, menu.y + menu.height / 2);
    await expect(page.getByRole("menu")).toBeVisible();
    await page.waitForTimeout(300);
    // (The open menu hides the page from assistive tech: read the DOM.)
    await expect(song.locator("[data-play]")).toHaveAttribute("aria-label", "Play Song");
    expect(await page.evaluate(() => document.querySelector("audio")?.paused ?? true)).toBe(true);

    // A second tap on the ⋯ closes the menu, and only closes it (while the
    // menu is open the button itself takes no pointer events: the art
    // under it gets the press).
    await page.touchscreen.tap(menu.x + menu.width / 2, menu.y + menu.height / 2);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(song.locator("[data-play]")).toHaveAttribute("aria-label", "Play Song");
    expect(await page.evaluate(() => document.querySelector("audio")?.paused ?? true)).toBe(true);

    // So does a tap on the art.
    await page.touchscreen.tap(menu.x + menu.width / 2, menu.y + menu.height / 2);
    await expect(page.getByRole("menu")).toBeVisible();
    const art = (await song.locator("[data-hero]").boundingBox())!;
    await page.touchscreen.tap(art.x + art.width / 2, art.y + art.height / 3);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(song.locator("[data-play]")).toHaveAttribute("aria-label", "Play Song");
    expect(await page.evaluate(() => document.querySelector("audio")?.paused ?? true)).toBe(true);

    // With nothing open, the same tap plays.
    await page.touchscreen.tap(art.x + art.width / 2, art.y + art.height / 3);
    await expect(song.locator("[data-play]")).toHaveAttribute("aria-label", "Pause Song");
  });
});

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
    await expect(rowMark(song)).toHaveAttribute("data-row-mark", "playing");
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

    // A second click pauses it; the music icon comes back (the icon isn't
    // a control: no play mark), and the second line keeps its time.
    await clickAt(page, song.locator('[data-slot="item-title"]'));
    await expect(rowToggle(song)).toHaveAttribute("aria-label", "Play Song");
    await expect(rowMark(song)).toHaveCount(0);
    await page.mouse.move(0, 0);
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
    // Keyboard focus opens the hover preview, as on other rows: the player
    // card.
    const preview = page.locator('[data-slot="hover-card-content"]');
    await expect(preview.locator('[data-face="audio"]')).toBeVisible();
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

/** The open hover preview's player card. */
const audioPreview = (page: Page) =>
  page.locator('[data-slot="hover-card-content"] [data-face="audio"]');

test.describe("Audio pearls: the hover preview is a player card", () => {
  test("the sleeve art as its hero, the title over the fade, the track, the times and the transport", async ({
    page,
    seed,
    baseURL,
  }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    // Birds: a link with its page's image; Song: an upload without one.
    await seed.link({
      url: "https://sounds.example/birds.wav",
      title: "Birds",
      contentType: "AUDIO",
      thumbnail: `${baseURL}/icon.png`,
      duration: 156,
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await seedSong(seed);
    await openHome(page);

    // Birds: the image hero, the preview's full width, 180px tall.
    await row(page, "Birds").hover();
    const birds = audioPreview(page);
    await expect(birds).toBeVisible();
    const content = page.locator('[data-slot="hover-card-content"]');
    const hero = birds.locator('img[data-hero="image"]');
    await expect(hero).toBeVisible();
    await expect(birds.locator('[data-hero="icon"]')).toHaveCount(0);
    const heroBox = (await hero.boundingBox())!;
    expect(Math.abs(heroBox.height - 180)).toBeLessThanOrEqual(0.5);
    // The preview's own width (`w-64`).
    const contentWidth = await content.evaluate((el) => el.clientWidth);
    expect(contentWidth).toBe(256);
    expect(Math.abs(heroBox.width - contentWidth)).toBeLessThanOrEqual(0.5);
    await expect(hero).toHaveCSS("object-fit", "cover");
    await expect(birds).toContainText("Birds");
    await expect(birds).toContainText("sounds.example");
    await expect(birds.getByRole("slider", { name: "Seek Birds" })).toBeVisible();
    await expect(birds.locator("[data-times] [data-elapsed]")).toHaveText("0:00");
    await expect(birds.locator("[data-times] [data-length]")).toHaveText("2:36");
    await expect(birds.getByRole("button", { name: "Restart Birds" })).toBeDisabled();
    await expect(birds.getByRole("button", { name: "Play Birds" })).toBeVisible();
    await expect(birds.getByRole("link", { name: "Open file" })).toHaveAttribute(
      "href",
      "https://sounds.example/birds.wav",
    );

    // Song: no image, the icon hero; an upload has no second line.
    await page.mouse.move(0, 0);
    await expect(audioPreview(page)).toHaveCount(0);
    await row(page, "Song").hover();
    const song = audioPreview(page);
    await expect(song).toBeVisible();
    const iconHero = song.locator('[data-hero="icon"]');
    await expect(iconHero).toBeVisible();
    await expect(song.locator('[data-hero="image"]')).toHaveCount(0);
    expect(Math.abs((await iconHero.boundingBox())!.height - 180)).toBeLessThanOrEqual(0.5);
    await expect(song).toContainText("Song");
    await expect(song).not.toContainText("Audio ·");
    await expect(song.getByRole("slider", { name: "Seek Song" })).toBeVisible();
    await expect(song.locator("[data-times] [data-elapsed]")).toHaveText("0:00");
    await expect(song.locator("[data-times] [data-length]")).toHaveText("2:36");
    await expect(song.getByRole("button", { name: "Restart Song" })).toBeVisible();
    await expect(song.getByRole("link", { name: "Open file" })).toBeVisible();

    // Its Play plays the row's pearl: one element, the row's mark shows.
    await song.getByRole("button", { name: "Play Song" }).click();
    await expect(song.getByRole("button", { name: "Pause Song" })).toBeVisible();
    await expect(rowMark(row(page, "Song"))).toHaveAttribute("data-row-mark", "playing");
    expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(1);
    await expect(song.getByRole("button", { name: "Restart Song" })).toBeEnabled();
  });
});
