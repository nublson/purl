import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// Haptics on touch screens. A browser test can't feel a haptic, so:
// - iOS: `HapticTarget`'s hidden switch toggles on a real tap, which is
//   what makes Safari tick. Each toggle's `change` is counted at the
//   document (a switch already removed from the page never gets there,
//   exactly the case with no tick).
// - Android: `navigator.vibrate` is stubbed to record its patterns.

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

declare global {
  interface Window {
    __vibrations?: number[][];
    __ticks?: number;
  }
}

/** Records vibrations and switch ticks from the page's first script on. */
async function installProbes(page: Page) {
  await page.addInitScript(() => {
    window.__vibrations = [];
    window.__ticks = 0;
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern: number | number[]) => {
        window.__vibrations!.push(Array.isArray(pattern) ? pattern : [pattern]);
        return true;
      },
    });
    document.addEventListener(
      "change",
      (event) => {
        if ((event.target as Element).closest("[data-haptic-target]")) {
          window.__ticks! += 1;
        }
      },
      true,
    );
  });
}

const vibrations = (page: Page) => page.evaluate(() => window.__vibrations ?? []);
const ticks = (page: Page) => page.evaluate(() => window.__ticks ?? 0);
const resetProbes = (page: Page) =>
  page.evaluate(() => {
    window.__vibrations = [];
    window.__ticks = 0;
  });

/**
 * A finger tap in the middle of `target`. Not `locator.tap()`: the haptic
 * label covers the control on purpose, which Playwright's actionability
 * check reads as something in the way.
 */
async function tapOn(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("tap target isn't visible");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/** Requests matching `method` and `path`, counted from now on. */
function countRequests(page: Page, method: string, path: RegExp) {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.method() === method && path.test(new URL(request.url()).pathname)) {
      seen.push(request.postData() ?? "");
    }
  });
  return seen;
}

async function openShare(page: Page) {
  await page.goto("/folders/design");
  await waitForHydration(page, 'button[aria-haspopup="dialog"]');
  await page.getByRole("button", { name: /^(Share|Public, sharing settings)$/ }).click();
  await expect(page.getByRole("switch", { name: "Public" })).toBeVisible();
}

test.describe("Haptics: switches", () => {
  test.use(phone);
  test.beforeEach(async ({ page }) => installProbes(page));

  test("the Public switch ticks, vibrates once and still saves", async ({ page, seed }) => {
    await seed.folder({ name: "Design", slug: "design" });
    await openShare(page);
    const saves = countRequests(page, "PATCH", /^\/api\/folders\/[^/]+$/);

    await tapOn(page, page.getByRole("switch", { name: "Public" }));

    await expect(page.getByRole("switch", { name: "Public" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Copy link" })).toBeEnabled();
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10]]);
    expect(saves).toHaveLength(1);
  });
});

test.describe("Haptics: folder tags", () => {
  test.use(phone);
  test.beforeEach(async ({ page }) => installProbes(page));

  test("Folder tags ticks, vibrates once and saves", async ({ page, seed }) => {
    await seed.link({ url: "https://alpha.example", title: "Alpha" });
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    const saves = countRequests(page, "PATCH", /^\/api\/user\/layout$/);
    await page.getByRole("button", { name: "Account menu" }).tap();
    const item = page.getByRole("menuitemcheckbox", { name: "Folder tags" });
    await expect(item).toBeVisible();

    await tapOn(page, item);

    await expect(item).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10]]);
    await expect.poll(() => saves.length).toBe(1);
    expect(JSON.parse(saves[0])).toEqual({ folderTags: true });
    // The item keeps the menu open.
    await expect(item).toBeVisible();
  });
});

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const row = (page: Page, title: string) =>
  rows(page).filter({ has: page.getByRole("checkbox", { name: `Select ${title}`, exact: true }) });

/** A finger held on `target` for 700ms, then lifted (Chromium: raw touch events). */
async function longPress(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function seedRows(seed: { link: (link: { url: string; title?: string }) => Promise<string> }, count = 3) {
  for (let i = count; i >= 1; i--) {
    await seed.link({ url: `https://link${i}.example`, title: `Link ${i}` });
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test.describe("Haptics: rows", () => {
  test.use(phone);
  test.beforeEach(async ({ page }) => installProbes(page));

  async function openHome(page: Page) {
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
  }
  const selectedCount = (page: Page) => page.locator('[data-cy="link-item"][data-selected]').count();

  test("a long-press selects the row and vibrates", async ({ page, seed, browserName }) => {
    test.skip(browserName !== "chromium", "raw touch events are Chromium-only");
    await seedRows(seed);
    await openHome(page);
    await longPress(page, row(page, "Link 1"));
    await expect(row(page, "Link 1")).toHaveAttribute("data-selected", "true");
    expect(await vibrations(page)).toEqual([[10]]);
    // The lift lands on the overlay that selecting mounted: a tick, and the
    // row stays selected (the long-press already toggled it).
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await selectedCount(page)).toBe(1);
  });

  test("the checkbox ticks; while selecting, a tap toggles a row and ticks", async ({ page, seed, context }) => {
    await seedRows(seed);
    await openHome(page);
    const popups: unknown[] = [];
    context.on("page", (popup) => popups.push(popup));

    await tapOn(page, row(page, "Link 1").getByRole("checkbox"));
    await expect(row(page, "Link 1")).toHaveAttribute("data-selected", "true");
    await expect.poll(() => ticks(page)).toBe(1);

    await tapOn(page, row(page, "Link 2").getByText("Link 2", { exact: true }));
    await expect(row(page, "Link 2")).toHaveAttribute("data-selected", "true");
    await expect.poll(() => ticks(page)).toBe(2);
    expect(await vibrations(page)).toEqual([[10], [10]]);
    expect(await selectedCount(page)).toBe(2);

    // Deselecting the last ones ends selection (unmounting the overlays):
    // still a tick each.
    await tapOn(page, row(page, "Link 2").getByText("Link 2", { exact: true }));
    await tapOn(page, row(page, "Link 1").getByText("Link 1", { exact: true }));
    await expect.poll(() => selectedCount(page)).toBe(0);
    await expect.poll(() => ticks(page)).toBe(4);
    expect(popups).toHaveLength(0);
  });

  test("not selecting, a tap opens the link and nothing ticks", async ({ page, seed, context }) => {
    await seedRows(seed);
    await openHome(page);
    const target = row(page, "Link 1");
    // Only the checkbox's overlay: none over the row's link.
    await expect(target.locator("[data-haptic-target]")).toHaveCount(1);
    const popup = context.waitForEvent("page");
    await tapOn(page, target.getByText("Link 1", { exact: true }));
    await popup;
    expect(await ticks(page)).toBe(0);
    expect(await vibrations(page)).toEqual([]);
  });

  test("a drag that starts on a selecting row scrolls", async ({ page, seed, browserName }) => {
    test.skip(browserName !== "chromium", "touch scroll gestures are Chromium-only");
    await seedRows(seed, 30);
    await openHome(page);
    await tapOn(page, row(page, "Link 1").getByRole("checkbox"));
    await expect(row(page, "Link 1")).toHaveAttribute("data-selected", "true");
    const fifth = row(page, "Link 5");
    const before = (await fifth.boundingBox())!.y;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizeScrollGesture", {
      x: 195,
      y: before + 20,
      yDistance: -300,
      gestureSourceType: "touch",
    });
    await expect.poll(async () => (await fifth.boundingBox())!.y).toBeLessThan(before - 100);
  });
});

const card = (page: Page, title: string) =>
  page
    .locator('[data-cy="link-card"]')
    .filter({ has: page.getByRole("checkbox", { name: `Select ${title}`, exact: true }) });

test.describe("Haptics: cards", () => {
  test.use(phone);
  test.beforeEach(async ({ page }) => installProbes(page));

  async function openGrid(page: Page) {
    const saved = await page.request.patch("/api/user/layout", { data: { view: "grid" } });
    expect(saved.ok()).toBe(true);
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-card"]');
  }
  const isSelected = (target: Locator) =>
    target.getByRole("checkbox").getAttribute("aria-checked");

  test("a long-press selects the card and vibrates", async ({ page, seed, browserName }) => {
    test.skip(browserName !== "chromium", "raw touch events are Chromium-only");
    await seedRows(seed);
    await openGrid(page);
    await longPress(page, card(page, "Link 1").getByText("Link 1", { exact: true }));
    await expect.poll(() => isSelected(card(page, "Link 1"))).toBe("true");
    expect(await vibrations(page)).toEqual([[10]]);
    await expect.poll(() => ticks(page)).toBe(1);
    await expect.poll(() => isSelected(card(page, "Link 1"))).toBe("true");
  });

  test("the checkbox ticks; while selecting, a tap toggles a card and ticks", async ({ page, seed, context }) => {
    await seedRows(seed);
    await openGrid(page);
    const popups: unknown[] = [];
    context.on("page", (popup) => popups.push(popup));

    await tapOn(page, card(page, "Link 1").getByRole("checkbox"));
    await expect.poll(() => isSelected(card(page, "Link 1"))).toBe("true");
    await expect.poll(() => ticks(page)).toBe(1);

    await tapOn(page, card(page, "Link 2").getByText("Link 2", { exact: true }));
    await expect.poll(() => isSelected(card(page, "Link 2"))).toBe("true");
    await expect.poll(() => ticks(page)).toBe(2);
    expect(await vibrations(page)).toEqual([[10], [10]]);

    await tapOn(page, card(page, "Link 2").getByText("Link 2", { exact: true }));
    await tapOn(page, card(page, "Link 1").getByText("Link 1", { exact: true }));
    await expect.poll(() => isSelected(card(page, "Link 1"))).toBe("false");
    await expect.poll(() => ticks(page)).toBe(4);
    expect(popups).toHaveLength(0);
  });

  test("not selecting, a tap opens the link and nothing ticks", async ({ page, seed, context }) => {
    await seedRows(seed);
    await openGrid(page);
    const target = card(page, "Link 1");
    await expect(target.locator("[data-haptic-target]")).toHaveCount(1);
    const popup = context.waitForEvent("page");
    await tapOn(page, target.getByText("Link 1", { exact: true }));
    await popup;
    expect(await ticks(page)).toBe(0);
    expect(await vibrations(page)).toEqual([]);
  });
});

test.describe("Haptics: selection bar", () => {
  test.use(phone);
  test.beforeEach(async ({ page }) => installProbes(page));

  const bar = (page: Page) => page.getByRole("toolbar", { name: "Selected links" });

  /** Home with `title` selected by its checkbox, probes reset. */
  async function selectFirst(page: Page, title = "Link 1") {
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await tapOn(page, row(page, title).getByRole("checkbox"));
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => ticks(page)).toBe(1);
    await resetProbes(page);
  }

  test("Select all ticks", async ({ page, seed }) => {
    await seedRows(seed);
    await selectFirst(page);
    await tapOn(page, bar(page).getByRole("checkbox", { name: "Select all" }));
    await expect(bar(page)).toContainText("3");
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10]]);
  });

  test("Delete ticks once with a warning", async ({ page, seed }) => {
    await seedRows(seed);
    await selectFirst(page);
    await tapOn(page, bar(page).getByRole("button", { name: /^Delete 1 link$/ }));
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(1);
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[25, 60, 25]]);
  });

  test("Delete ticks even before the bar's animation code has loaded", async ({ page, seed }) => {
    // Until Motion's lazily loaded features arrive, the bar leaves at once
    // when the selection ends: Delete's button unmounts during its own tap.
    let holdScripts = false;
    await page.route("**/_next/static/chunks/**", async (route) => {
      if (holdScripts) await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.continue().catch(() => {});
    });
    await seedRows(seed);
    await page.goto("/home");
    holdScripts = true;
    await waitForHydration(page, '[data-cy="link-item"]');
    await tapOn(page, row(page, "Link 1").getByRole("checkbox"));
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => ticks(page)).toBe(1);
    await resetProbes(page);

    await tapOn(page, bar(page).getByRole("button", { name: /^Delete 1 link$/ }));
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(1);
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[25, 60, 25]]);
  });

  test("Move into a folder, out of one, or into a new one ticks once each", async ({ page, seed }) => {
    const design = await seed.folder({ name: "Design", slug: "design" });
    await seed.link({ url: "https://link3.example", title: "Link 3", folderId: design });
    await seed.link({ url: "https://link2.example", title: "Link 2" });
    await seed.link({ url: "https://link1.example", title: "Link 1" });
    await selectFirst(page);
    const moves = countRequests(page, "PATCH", /^\/api\/links\/bulk$/);

    await tapOn(page, bar(page).getByRole("button", { name: "Move" }));
    await tapOn(page, page.getByRole("menuitem", { name: /Design/ }));
    await expect.poll(() => moves.length).toBe(1);
    expect(JSON.parse(moves[0])).toMatchObject({ folderId: design });
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10, 60, 10]]);

    // A move ends the selection: select a filed link for "Remove from folders".
    await selectFirst(page, "Link 3");
    await tapOn(page, bar(page).getByRole("button", { name: "Move" }));
    await tapOn(page, page.getByRole("menuitem", { name: /Remove from/ }));
    await expect.poll(() => moves.length).toBe(2);
    expect(JSON.parse(moves[1])).toMatchObject({ folderId: null });
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10, 60, 10]]);

    await selectFirst(page, "Link 2");
    await tapOn(page, bar(page).getByRole("button", { name: "Move" }));
    await tapOn(page, page.getByRole("menuitem", { name: "New folder…" }));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10, 60, 10]]);
  });
});

test.describe("Haptics: row menu and Copy link", () => {
  test.use(phone);
  test.beforeEach(async ({ page }) => installProbes(page));

  async function openMenu(page: Page, title: string, path = "/home") {
    await page.goto(path);
    await waitForHydration(page, '[data-cy="link-item"]');
    await row(page, title).getByRole("button", { name: "Open link menu" }).tap();
    await expect(page.getByRole("menu")).toBeVisible();
  }

  test("Delete ticks once with a warning", async ({ page, seed }) => {
    await seedRows(seed);
    await openMenu(page, "Link 1");
    await tapOn(page, page.getByRole("menuitem", { name: "Delete" }));
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(1);
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[25, 60, 25]]);
  });

  test("Move to folder ticks on the folder, not on expanding", async ({ page, seed }) => {
    await seed.folder({ name: "Design", slug: "design" });
    await seedRows(seed);
    await openMenu(page, "Link 1");
    const moves = countRequests(page, "PATCH", /^\/api\/links\/[^/]+$/);
    await tapOn(page, page.getByRole("menuitem", { name: "Move to folder" }));
    await expect(page.getByRole("menuitem", { name: /Design/ })).toBeVisible();
    expect(await ticks(page)).toBe(0);
    expect(await vibrations(page)).toEqual([]);

    await tapOn(page, page.getByRole("menuitem", { name: /Design/ }));
    await expect.poll(() => moves.length).toBe(1);
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10, 60, 10]]);
  });

  test("the current folder doesn't tick", async ({ page, seed }) => {
    const design = await seed.folder({ name: "Design", slug: "design" });
    await seed.link({ url: "https://link1.example", title: "Link 1", folderId: design });
    await openMenu(page, "Link 1", "/folders/design");
    await tapOn(page, page.getByRole("menuitem", { name: "Move to folder" }));
    const current = page.getByRole("menuitem", { name: "Design", exact: true });
    await expect(current).toHaveAttribute("data-disabled", "");
    await tapOn(page, current);
    await page.waitForTimeout(300);
    expect(await ticks(page)).toBe(0);
    expect(await vibrations(page)).toEqual([]);
  });

  test("a failed copy doesn't vibrate a success", async ({ page, seed }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
    });
    await seed.folder({ name: "Design", slug: "design", isPublic: true });
    await openShare(page);
    await tapOn(page, page.getByRole("button", { name: "Copy link" }));
    await expect(page.getByText("Unable to copy the link")).toBeVisible();
    expect(await vibrations(page)).toEqual([]);
  });

  test("Copy link ticks once it's public; not while private", async ({ page, seed }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    });
    await seed.folder({ name: "Design", slug: "design" });
    await openShare(page);
    const copy = page.getByRole("button", { name: "Copy link" });
    await expect(copy).toBeDisabled();
    await tapOn(page, copy);
    await page.waitForTimeout(300);
    expect(await ticks(page)).toBe(0);
    expect(await vibrations(page)).toEqual([]);

    await tapOn(page, page.getByRole("switch", { name: "Public" }));
    await expect(copy).toBeEnabled();
    await resetProbes(page);
    await tapOn(page, copy);
    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
    await expect.poll(() => ticks(page)).toBe(1);
    expect(await vibrations(page)).toEqual([[10, 60, 10]]);
  });
});

test.describe("Haptics: desktop", () => {
  test.beforeEach(async ({ page }) => installProbes(page));

  test("no haptic target is visible", async ({ page, seed }) => {
    await seed.folder({ name: "Design", slug: "design" });
    await openShare(page);
    const targets = page.locator("[data-haptic-target]");
    expect(await targets.count()).toBeGreaterThan(0);
    for (const target of await targets.all()) await expect(target).toBeHidden();
  });

  test("clicking the switch never vibrates or ticks", async ({ page, seed }) => {
    await seed.folder({ name: "Design", slug: "design" });
    await openShare(page);
    await page.getByRole("switch", { name: "Public" }).click();
    await expect(page.getByRole("switch", { name: "Public" })).toBeChecked();
    expect(await vibrations(page)).toEqual([]);
    expect(await ticks(page)).toBe(0);
  });

  test("Tab order and names are unchanged", async ({ page, seed, browserName }) => {
    // Desktop WebKit, like Safari, doesn't Tab to buttons by default.
    test.skip(browserName === "webkit", "WebKit skips buttons on Tab");
    await seed.folder({ name: "Design", slug: "design", isPublic: true });
    await openShare(page);
    await page.getByRole("switch", { name: "Public" }).focus();
    await page.keyboard.press("Tab");
    // The switch, then straight to the copy button: nothing unnamed between.
    await expect(page.getByRole("button", { name: "Copy link" })).toBeFocused();
  });
});

