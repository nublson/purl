import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";
import { silentWav } from "./support/media";

// Image, video and audio pearls show the media itself: the grid card is the
// image or the video (no title strip), audio gets a player strip, and a list
// row's favicon slot is the image's preview.

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

test.describe("Media pearls", () => {
  test("cards show the image, the video and the audio player", async ({
    page,
    seed,
    baseURL,
  }) => {
    // The app's own icon: an image that loads locally in both browsers.
    const icon = `${baseURL}/icon.png`;
    await page.context().route("https://clips.example/**", (route) => route.abort());
    await page.context().route("https://sounds.example/**", (route) => route.abort());

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
    await seed.link({
      url: "https://sounds.example/song.mp3",
      title: "Song",
      contentType: "AUDIO",
      duration: 65,
    });

    await openHome(page);
    await chooseView(page, "Grid");
    await expect(cards(page)).toHaveCount(4);

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

    // Audio: the player strip, then the title.
    const song = card(page, "Song");
    await expect(song.getByRole("button", { name: "Play Song" })).toBeVisible();
    await expect(song.getByText("0:00 / 1:05")).toBeVisible();
    await expect(song.getByRole("slider")).toBeVisible();
    await expect(song.getByText("Song", { exact: true })).toBeVisible();

    // A file that won't load: Play opens nothing and turns back to Play.
    let popups = 0;
    page.on("popup", () => popups++);
    await song.getByRole("button", { name: "Play Song" }).click();
    await expect(song.getByRole("button", { name: "Play Song" })).toBeVisible();
    expect(popups).toBe(0);
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

  test("while selecting, a click on the audio strip selects the card", async ({ page, seed }) => {
    await page.context().route("https://sounds.example/**", (route) => route.abort());
    await seed.link({
      url: "https://sounds.example/song.mp3",
      title: "Song",
      contentType: "AUDIO",
      duration: 65,
    });
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await openHome(page);
    await chooseView(page, "Grid");

    const alpha = card(page, "Alpha");
    await alpha.hover();
    await alpha.getByRole("checkbox", { name: "Select Alpha" }).click();

    // While selecting, the card's link leaves the accessibility tree: find
    // the card by its text.
    const song = cards(page).filter({ hasText: "sounds.example" });
    // The controls step aside: out of reach of focus and clicks.
    const play = song.locator('[inert] button[aria-label="Play Song"]');
    await expect(play).toHaveCount(1);
    // Inert: it can't take focus.
    expect(
      await play.evaluate((el: HTMLElement) => {
        el.focus();
        return document.activeElement === el;
      }),
    ).toBe(false);
    // A click where the Play button sits lands on the card, not the button.
    const box = await play.boundingBox();
    if (!box) throw new Error("no Play button box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(song.getByRole("checkbox", { name: "Select Song" })).toBeChecked();
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
    // The button still covers the rest of the card (a media link: its domain).
    await expect(sharedCard("Song")).toContainText("sounds.example");
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
