import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Folders reorder in the folder menu itself: drag a row by its grip (shown
// on hover in place of the emoji; always, at the row's end, on touch
// screens) or Alt+Up / Alt+Down on the highlighted row. Each drop saves, and
// the digit shortcuts follow the new order.

test.use({ colorScheme: "dark" });

const FOLDER_BUTTON = 'button[aria-label^="Folder:"]';

async function openMenu(page: Page) {
  await waitForHydration(page, FOLDER_BUTTON);
  await page.locator(FOLDER_BUTTON).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").first()).toBeVisible();
  return menu;
}

/** Waits out the menu's open animation (it scales), before measuring. */
async function menuSettled(menu: Locator) {
  await menu.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

async function closeMenu(page: Page) {
  await page.keyboard.press("Escape");
  // Fully closed: a click on the trigger during the close is dropped.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("style", /pointer-events/);
}

/** Folder names in menu order (the open menu's, or opens it to read them). */
async function menuFolderNames(page: Page) {
  const wasOpen = (await page.getByRole("menu").count()) > 0;
  const menu = wasOpen ? page.getByRole("menu") : await openMenu(page);
  const names = await menu
    .locator('a[href^="/folders/"]')
    .evaluateAll((items) =>
      items.map((item) => item.querySelector(".truncate")?.textContent?.trim() ?? ""),
    );
  if (!wasOpen) await closeMenu(page);
  return names;
}

function folderRow(menu: Locator, name: string) {
  return menu.locator('a[href^="/folders/"]').filter({ hasText: name });
}

/** The visible grip of a row (hovering it first, as a mouse would). */
async function grip(row: Locator) {
  await row.hover();
  const handle = row.locator("[data-folder-grip]:visible");
  await expect(handle).toHaveCount(1);
  return handle;
}

/**
 * Drags `handle` vertically to `toY`, one animation frame per step, as a
 * hand would: Motion reads the pointer once per frame, and WebKit under
 * parallel test load can otherwise get the whole drag, release included,
 * between two frames, so it never reorders.
 */
async function dragTo(
  page: Page,
  handle: Locator,
  toY: number,
  {
    steps = 12,
    holdFrames = 0,
    release = true,
  }: { steps?: number; holdFrames?: number; release?: boolean } = {},
) {
  const nextFrame = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const from = (await handle.boundingBox())!;
  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await nextFrame();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(x, startY + ((toY - startY) * step) / steps);
    await nextFrame();
  }
  // Hold there (a pixel of jitter keeps the pointer "moving").
  for (let frame = 0; frame < holdFrames; frame++) {
    await page.mouse.move(x, toY - (frame % 2));
    await nextFrame();
  }
  if (release) await page.mouse.up();
}

async function bottomOf(row: Locator) {
  const box = (await row.boundingBox())!;
  return box.y + box.height * 0.9;
}

async function seedThree(seed: {
  folder: (f: { name: string; slug: string }) => Promise<string>;
}) {
  await seed.folder({ name: "Alpha", slug: "alpha" });
  await seed.folder({ name: "Beta", slug: "beta" });
  await seed.folder({ name: "Gamma", slug: "gamma" });
}

test.describe("Reorder folders in the folder menu", () => {
  test("hovering a row swaps its emoji for the grip", async ({ page, seed }, testInfo) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const alpha = folderRow(menu, "Alpha");
    await expect(alpha.locator("[data-folder-grip]:visible")).toHaveCount(0);
    await grip(alpha);
    await expect(alpha.getByText("🦪")).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath("menu-hover-grip.png"),
      clip: { x: 0, y: 0, width: 420, height: 360 },
    });
  });

  test("dragging a row saves the new order without opening a folder", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const handle = await grip(folderRow(menu, "Alpha"));
    await dragTo(page, handle, await bottomOf(folderRow(menu, "Gamma")));

    // The menu stays open and nothing navigated.
    await expect(menu).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
    await expect.poll(() => menuFolderNames(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    await expect(menu.getByRole("status")).toHaveText("Alpha moved to position 3 of 3");

    await closeMenu(page);
    await page.waitForLoadState("networkidle");
    await page.reload();
    expect(await menuFolderNames(page)).toEqual(["Beta", "Gamma", "Alpha"]);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/folders\/beta$/);
  });

  test("releasing a drag over Home or New folder doesn't activate them", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/folders/gamma");
    let menu = await openMenu(page);

    // Overshoot up onto Home.
    const home = menu.getByRole("menuitem", { name: /^Home/ });
    let handle = await grip(folderRow(menu, "Beta"));
    const homeBox = (await home.boundingBox())!;
    await dragTo(page, handle, homeBox.y + homeBox.height / 2);
    await expect(menu).toBeVisible();
    await expect(page).toHaveURL(/\/folders\/gamma$/);
    await expect.poll(() => menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);

    // Overshoot down onto New folder.
    menu = page.getByRole("menu");
    const newFolder = menu.getByRole("menuitem", { name: "New folder" });
    handle = await grip(folderRow(menu, "Beta"));
    const newBox = (await newFolder.boundingBox())!;
    await dragTo(page, handle, newBox.y + newBox.height / 2);
    await expect(menu).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/folders\/gamma$/);
  });

  test("moves are announced inside the open menu, and at the ends", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const alpha = folderRow(menu, "Alpha");
    await alpha.focus();
    await page.keyboard.press("Alt+ArrowDown");
    // Inside the menu: Radix hides everything outside an open menu from
    // assistive tech, so a region there would never be read.
    await expect(menu.getByRole("status")).toHaveText("Alpha moved to position 2 of 3");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(menu.getByRole("status")).toHaveText("Alpha is already last");
  });

  test("pressing the grip without dragging doesn't open the folder", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    await (await grip(folderRow(menu, "Beta"))).click();
    await expect(menu).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("Alt+ArrowDown moves the highlighted row and keeps it highlighted", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const alpha = folderRow(menu, "Alpha");
    await alpha.focus();
    await page.keyboard.press("Alt+ArrowDown");

    expect(await menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);
    await expect(alpha).toBeFocused();
    await expect(page).toHaveURL(/\/home$/);

    await closeMenu(page);
    await page.waitForLoadState("networkidle");
    await page.reload();
    expect(await menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  test("a new folder goes to the bottom after reordering", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await folderRow(menu, "Gamma").focus();
    await page.keyboard.press("Alt+ArrowUp");
    expect(await menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta"]);

    await menu.getByRole("menuitem", { name: "New folder" }).click();
    await page.getByLabel("Folder name").fill("Delta");
    await page.getByRole("button", { name: "Create folder" }).click();
    await expect(page).toHaveURL(/\/folders\/delta$/);

    expect(await menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta", "Delta"]);
  });

  test("the folder list scrolls while dragging near its edge", async ({ page, seed }) => {
    const names = Array.from({ length: 14 }, (_, i) => `Folder ${String(i + 1).padStart(2, "0")}`);
    for (const name of names) {
      await seed.folder({ name, slug: name.toLowerCase().replace(" ", "-") });
    }
    await page.goto("/home");
    const menu = await openMenu(page);
    const list = menu
      .locator('[role="group"]')
      .filter({ has: page.locator('a[href^="/folders/"]') });
    const box = (await list.boundingBox())!;

    const handle = await grip(folderRow(menu, "Folder 01"));
    // Hold near the list's bottom edge for a while.
    await dragTo(page, handle, box.y + box.height - 4, { holdFrames: 60 });

    await expect
      .poll(async () => (await menuFolderNames(page)).indexOf("Folder 01"))
      .toBeGreaterThan(7);
  });

  test("no grips with fewer than two folders", async ({ page, seed }) => {
    await seed.folder({ name: "Alpha", slug: "alpha" });
    await page.goto("/home");
    const menu = await openMenu(page);
    await folderRow(menu, "Alpha").hover();
    await expect(menu.locator("[data-folder-grip]")).toHaveCount(0);
  });
});

test.describe("Reorder folders on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("each row shows its grip at the end, keeps its emoji and hides the digit key", async ({ page, seed }, testInfo) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);

    const beta = folderRow(menu, "Beta");
    const handle = beta.locator("[data-folder-grip]:visible");
    await expect(handle).toHaveCount(1);
    await expect(beta.getByText("🦪")).toBeVisible();
    await expect(beta.locator("kbd")).toBeHidden();
    // At the row's end, after the name.
    const nameBox = (await beta.locator(".truncate").boundingBox())!;
    expect((await handle.boundingBox())!.x).toBeGreaterThan(nameBox.x + nameBox.width);
    await page.screenshot({ path: testInfo.outputPath("menu-touch-grips.png") });

    await dragTo(page, handle, (await folderRow(menu, "Alpha").boundingBox())!.y + 2);
    await expect.poll(() => menuFolderNames(page)).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});

/** `transform` of a folder row's draggable wrapper, sampled once per frame. */
async function sampleTransforms(page: Page, slug: string, frames: number) {
  return page.evaluate(
    async ({ slug, frames }) => {
      const wrapper = document.querySelector(`a[href="/folders/${slug}"]`)!.parentElement!;
      const samples: string[] = [];
      for (let i = 0; i < frames; i++) {
        samples.push(getComputedStyle(wrapper).transform);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return samples;
    },
    { slug, frames },
  );
}

async function draggableRowsReady(menu: Locator) {
  await expect(menu.locator("[data-folder-grip]").first()).toBeAttached();
}

test.describe("Folder menu reorder polish", () => {
  test("a drag stays by the folder list and snaps back quickly", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await menuSettled(menu);
    const list = (await menu
      .locator('[role="group"]')
      .filter({ has: page.locator('a[href^="/folders/"]') })
      .boundingBox())!;
    const listBottom = list.y + list.height;
    const beta = folderRow(menu, "Beta");

    // Far below the list (and the whole menu), still holding.
    await dragTo(page, await grip(beta), listBottom + 300, { release: false });
    const held = (await beta.boundingBox())!;
    // Bounded by the list, with only a little elastic pull past it.
    expect(held.y + held.height).toBeLessThanOrEqual(listBottom + 40);

    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await sampleTransforms(page, "beta", 1)).toEqual(["none"]);
    await expect.poll(() => menuFolderNames(page)).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  test("rows don't slide with reduced motion", async ({ page, seed }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await draggableRowsReady(menu);

    await folderRow(menu, "Alpha").focus();
    await page.keyboard.press("Alt+ArrowDown");
    // A jump, not a slide: Motion may hold the old offset for the first
    // frame, but never shows a position in between.
    const samples = await sampleTransforms(page, "beta", 6);
    const offsets = samples.filter((t) => t !== "none");
    expect(offsets.length, JSON.stringify(samples)).toBeLessThanOrEqual(1);
    expect(samples.at(-1)).toBe("none");
  });

  test("rows slide briefly and settle within a dropdown's budget", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await draggableRowsReady(menu);

    await folderRow(menu, "Alpha").focus();
    await page.keyboard.press("Alt+ArrowDown");
    const moving = await sampleTransforms(page, "beta", 3);
    expect(moving.some((t) => t !== "none")).toBe(true);
    await page.waitForTimeout(320);
    expect(await sampleTransforms(page, "beta", 1)).toEqual(["none"]);
  });

  test("keyboard highlight shows the grip, and a visible focus ring", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await draggableRowsReady(menu);

    await page.keyboard.press("ArrowDown"); // Home
    await page.keyboard.press("ArrowDown"); // Alpha
    const alpha = folderRow(menu, "Alpha");
    await expect(alpha).toBeFocused();
    await expect(alpha.locator("[data-folder-grip]:visible")).toHaveCount(1);
    await expect(alpha.getByText("🦪")).toBeHidden();
    // Tailwind always sets box-shadow (transparent ring layers): look for the ring.
    expect(await alpha.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("2px inset");
  });

  test("the hover grip lines up with the emoji column", async ({ page, seed }) => {
    await seed.folder({ name: "Dev Tool", slug: "dev", emoji: "🛠️" });
    await seed.folder({ name: "Reading list", slug: "reading", emoji: "📚" });
    await page.goto("/home");
    const menu = await openMenu(page);
    await grip(folderRow(menu, "Dev Tool"));
    const { emoji, drawn } = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(
        document.querySelector('[role=menu] a[href="/folders/reading"] span[aria-hidden]')!,
      );
      const glyph = range.getBoundingClientRect();
      const handle = [
        ...document.querySelectorAll('[role=menu] a[href="/folders/dev"] [data-folder-grip]'),
      ].find((el) => getComputedStyle(el).display !== "none")!;
      const paths = [...handle.querySelectorAll("path")].map((p) => p.getBoundingClientRect());
      return {
        emoji: { left: glyph.left, right: glyph.right },
        drawn: {
          left: Math.min(...paths.map((p) => p.left)),
          right: Math.max(...paths.map((p) => p.right)),
        },
      };
    });
    const center = (box: { left: number; right: number }) => (box.left + box.right) / 2;
    expect(Math.abs(center(drawn) - center(emoji))).toBeLessThan(1);
    // Wide enough to read as the emoji's column, not an indented icon.
    expect(drawn.right - drawn.left).toBeGreaterThanOrEqual(12);
  });

  test("mouse hover doesn't draw the keyboard focus ring", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    const alpha = folderRow(menu, "Alpha");
    await alpha.hover();
    await expect(alpha).toBeFocused();
    expect(await alpha.evaluate((el) => getComputedStyle(el).boxShadow)).not.toContain("2px inset");
  });

  test("a cut-off name has its full text as a tooltip; the hint is keyboard-specific", async ({ page, seed }) => {
    const long = "Design inspiration and references for later";
    await seed.folder({ name: "Alpha", slug: "alpha" });
    await seed.folder({ name: long, slug: "long" });
    await page.goto("/home");
    const menu = await openMenu(page);
    await expect(folderRow(menu, "Design").locator(".truncate")).toHaveAttribute("title", long);
    await expect(folderRow(menu, "Alpha")).toHaveAccessibleDescription(/^With a keyboard/);
  });

  test("an identical announcement is announced again", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    await folderRow(menu, "Gamma").focus();
    await page.evaluate(() => {
      const region = document.querySelector('[role="menu"] [role="status"]')!;
      (window as unknown as { __changes: number }).__changes = 0;
      new MutationObserver(() => {
        (window as unknown as { __changes: number }).__changes++;
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });
    const changes = () =>
      page.evaluate(() => (window as unknown as { __changes: number }).__changes);

    await page.keyboard.press("Alt+ArrowDown");
    await expect(menu.getByRole("status")).toHaveText("Gamma is already last");
    const afterFirst = await changes();
    await page.keyboard.press("Alt+ArrowDown");
    await expect.poll(changes).toBeGreaterThan(afterFirst);
    await expect(menu.getByRole("status")).toHaveText("Gamma is already last");
  });
});

test.describe("Folder menu reorder polish on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Home's check lines up with the folders' grips, and its shortcut hint is gone", async ({ page, seed }) => {
    await seedThree(seed);
    // No digit keys on touch: Home's shortcut slot is hidden while it isn't current.
    await page.goto("/folders/beta");
    let menu = await openMenu(page);
    await menuSettled(menu);
    await expect(menu.getByRole("menuitem", { name: /^Home/ }).locator("kbd")).toBeHidden();
    await closeMenu(page);

    // Home has no grip, so its check takes the grips' column (a folder's own
    // check sits beside its grip instead).
    await page.goto("/home");
    menu = await openMenu(page);
    await menuSettled(menu);
    const homeCheck = (await menu
      .getByRole("menuitem", { name: /^Home/ })
      .locator("[data-current-mark]:visible svg")
      .boundingBox())!;
    const grip = (await folderRow(menu, "Alpha")
      .locator("[data-folder-grip]:visible svg")
      .boundingBox())!;
    expect(Math.abs(homeCheck.x - grip.x)).toBeLessThan(1);
    expect(Math.abs(homeCheck.width - grip.width)).toBeLessThan(1);
  });

  test("a press low on a grip picks up that row, not the next", async ({ page, seed }) => {
    await seedThree(seed);
    await page.goto("/home");
    const menu = await openMenu(page);
    const box = (await folderRow(menu, "Alpha").locator("[data-folder-grip]:visible").boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href"),
      { x: box.x + box.width / 2, y: box.y + box.height - 2 },
    );
    expect(hit).toBe("/folders/alpha");
  });

  test("a long name doesn't squeeze the grip or leave an empty slot before it", async ({ page, seed }) => {
    await seed.folder({ name: "Alpha", slug: "alpha" });
    await seed.folder({ name: "Design inspiration and references for later", slug: "long" });
    await page.goto("/home");
    const menu = await openMenu(page);
    const row = folderRow(menu, "Design");
    // Layout width: the menu's open animation scales its bounding box.
    const width = await row
      .locator("[data-folder-grip]:visible")
      .evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(width).toBe(32);
    await expect(row.locator("[data-current-mark]")).toBeHidden();
  });
});
