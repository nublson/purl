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
});
