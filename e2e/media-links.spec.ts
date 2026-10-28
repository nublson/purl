import type { Locator, Page, Route } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import type { seedLink } from "./support/db";
import { silentWav } from "./support/media";

// Image, video and audio pearls show the media itself: the grid card is the
// image or the video (no title strip), audio is a now-playing bar (sleeve,
// title, second line, play, a track along the foot), and a list row's
// favicon slot is the image's preview.

const cards = (page: Page) => page.locator('[data-cy="link-card"]');
// A page's card is a link; a media pearl's card opens the viewer (a button).
const card = (page: Page, title: string) =>
  cards(page).filter({
    has: page
      .getByRole("link", { name: `${title} (opens in new tab)`, exact: true })
      .or(page.getByRole("button", { name: title, exact: true })),
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
 * no pointer events of their own (the card's button lies under or over them).
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

    // While selecting, the card's button leaves the accessibility tree: find
    // the card by its bar.
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

  test("a shared folder's grid shows the media, and Play opens nothing", async ({
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

    // An audio card's controls sit beside its button, never inside it (a
    // button can't live in a button): the card holds both.
    const songCard = cards(page).filter({ has: sharedCard("Song") });
    await expect(sharedCard("Song").getByRole("button")).toHaveCount(0);
    let popups = 0;
    page.on("popup", () => popups++);
    const url = page.url();
    await songCard.getByRole("button", { name: "Play Song" }).click();
    await expect(songCard.getByRole("button", { name: "Play Song" })).toBeVisible();
    expect(popups).toBe(0);
    expect(page.url()).toBe(url);
    // The button covers the rest of the bar: a click on its words opens the
    // viewer (the bar is what it morphs out of).
    await expect(songCard.locator('[data-face="audio"]')).toContainText("sounds.example");
    await clickAt(page, songCard.locator("[data-words]"));
    await expect(page.getByRole("dialog", { name: "Song" })).toBeVisible();
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
    // The card is the button that opens the viewer, never a link.
    await expect(song.locator("a")).toHaveCount(0);
    const bar = song.locator('[data-face="audio"]');
    await expect(bar.locator("[data-words]")).toContainText("Song");
    // At 210px the second line is the upload's facts in full; the sleeve
    // is the play control.
    expect(await secondLine(bar)).toBe("Audio · 2:36");
    const songPlay = song.getByRole("button", { name: "Play Song" });
    await expect(songPlay).toHaveAttribute("aria-pressed", "false");
    expect(await songPlay.evaluate((el) => el.closest("[data-sleeve]") !== null)).toBe(true);
    await expect(song.getByRole("slider", { name: "Seek Song" })).toHaveCount(1);
    // No preview image: the icon sleeve; Birds' page image is its sleeve.
    // (The mark is drawn on the icon's tint, the music note hidden.)
    await expect(song.locator('[data-sleeve="icon"] [data-play] svg')).toBeVisible();
    await expect(song.locator('[data-sleeve="icon"] svg.reicon')).toBeHidden();
    await expect(birds.locator('[data-sleeve="image"] img')).toBeVisible();
    const height = (await song.boundingBox())!.height;
    expect(Math.abs(height - 78)).toBeLessThanOrEqual(1);

    // Play: pressed, Pause, and the run moves along the track.
    await song.getByRole("button", { name: "Play Song" }).click();
    const pause = song.getByRole("button", { name: "Pause Song" });
    await expect(pause).toHaveAttribute("aria-pressed", "true");
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

  test("the hover preview's bar and the card's are one playback", async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(10) }),
    );
    await seedSong(seed);
    await openHome(page);

    await row(page, "Song").hover();
    const preview = page.locator('[data-face="audio"]');
    await expect(preview).toBeVisible();
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
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 selected")).toHaveCount(0);
    await expect(song).not.toHaveAttribute("data-selected", "true");
  });
});
