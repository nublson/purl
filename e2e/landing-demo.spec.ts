import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { PoolClient } from "pg";
import { expect, test } from "./fixtures";
import { createTestUser, deleteTestUser, pool, seedFolder, seedLink } from "./support/db";

// The landing page's live demo: the `purl` account's public folders, shown in
// the app's own header controls, read-only and with no API calls. The page
// revalidates hourly in production; `pnpm dev` renders per request, so the
// rows seeded here show up at once.
//
// This file owns the `purl` username while it runs (local database only).
// The tests are serial and the fallback test goes first, before `purl`
// exists, so the two states never overlap; `landing.spec.ts` only asserts
// things that hold in both states, so it can run alongside.

test.use({ signedIn: false });
test.describe.configure({ mode: "serial" });

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function purlExists(): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM "users" WHERE "username" = 'purl'`);
  return (rowCount ?? 0) > 0;
}

/** Collects requests to the app's API and console errors for the whole test. */
function watch(page: Page) {
  const apiRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  return { apiRequests, consoleErrors };
}

async function openDemo(page: Page) {
  // Favicons and links point at example.com: never hit the network.
  await page.context().route(/^https:\/\/example\.com\//, (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({ contentType: "image/png", body: PNG_1X1 })
      : route.fulfill({ contentType: "text/html", body: "<title>x</title>" }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Folder: Reading list" })).toBeVisible();
  // The menus are client components: wait until the trigger answers.
  await expect
    .poll(async () => {
      await page.getByRole("button", { name: "Folder: Reading list" }).click();
      const open = await page.getByRole("menu").isVisible();
      if (open) await page.keyboard.press("Escape");
      return open;
    })
    .toBe(true);
  await expect(page.getByRole("menu")).toBeHidden();
}

/** The demo's link rows (or cards): every saved link points at example.com. */
const rows = (page: Page) => page.locator('a[href^="https://example.com/"]');

// Chromium and WebKit run this file at the same time, and both need the one
// `purl` username: an advisory lock (held on its own connection for the whole
// file) makes the second wait for the first.
const LOCK_KEY = 7_302_024;
let lock: PoolClient | undefined;

test.describe("Landing demo", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    lock = await pool.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  });

  test.afterAll(async () => {
    await lock?.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    lock?.release();
  });

  test("without a purl account the still panel renders", async ({ page }) => {
    test.skip(await purlExists(), "a real purl account exists in this database");
    const { apiRequests } = watch(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "A home for your pearls" })).toBeVisible();
    await expect(page.locator('[data-landing-panel]')).toBeVisible();
    // The still picture is decorative; the demo's controls are absent.
    await expect(page.locator('[data-landing-panel]').locator("xpath=..")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("button", { name: /^Folder:/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
    expect(apiRequests).toEqual([]);
  });

  test.describe("with the purl account", () => {
    let userId: string;

    test.beforeAll(async () => {
      if (await purlExists()) throw new Error("A `purl` user already exists; refusing to touch it.");
      const user = await createTestUser(`e2e-demo-${randomUUID().slice(0, 8)}@purl.test`, "Purl");
      userId = user.id;
      await pool.query(`UPDATE "users" SET "username" = 'purl' WHERE "id" = $1`, [userId]);
      const reading = await seedFolder(userId, { name: "Reading list", slug: "reading-list", emoji: "📚", isPublic: true });
      const started = await seedFolder(userId, { name: "Getting started", slug: "getting-started", emoji: "🚀", isPublic: true });
      await seedFolder(userId, { name: "Design engineering", slug: "design-engineering", emoji: "🎨", isPublic: true });
      const secret = await seedFolder(userId, { name: "Secret", slug: "secret", emoji: "🔒", isPublic: false });
      for (const n of [1, 2, 3]) {
        await seedLink(userId, { url: `https://example.com/reading-${n}`, title: `Reading ${n}`, folderId: reading });
      }
      await seedLink(userId, { url: "https://example.com/paper.pdf", title: "Paper", folderId: reading, contentType: "PDF" });
      for (const n of [1, 2]) {
        await seedLink(userId, { url: `https://example.com/started-${n}`, title: `Started ${n}`, folderId: started });
      }
      await seedLink(userId, { url: "https://example.com/secret-1", title: "Secret 1", folderId: secret });
    });

    test.afterAll(async () => {
      if (userId) await deleteTestUser(userId);
    });

    test("opens on Reading list with its links; Secret never appears", async ({ page }) => {
      await openDemo(page);
      await expect(rows(page)).toHaveCount(4);
      await expect(page.getByText("Reading 1")).toBeVisible();
      await expect(page.getByText("Secret 1")).toHaveCount(0);

      await page.getByRole("button", { name: "Folder: Reading list" }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: /Reading list/ })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: /Secret/ })).toHaveCount(0);
    });

    test("choosing a folder switches in place and disables everything that writes", async ({ page }) => {
      await openDemo(page);
      await page.getByRole("button", { name: "Folder: Reading list" }).click();
      const menu = page.getByRole("menu");
      for (const name of [/Home/, /New folder/, /Edit folder/, /Delete folder/]) {
        await expect(menu.getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
      }
      await menu.getByRole("menuitem", { name: /Getting started/ }).click();

      await expect(page.getByRole("button", { name: "Folder: Getting started" })).toBeVisible();
      await expect(rows(page)).toHaveCount(2);
      await expect(page.getByText("Started 1")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("an empty folder shows the empty message", async ({ page }) => {
      await openDemo(page);
      await page.getByRole("button", { name: "Folder: Reading list" }).click();
      await page.getByRole("menuitem", { name: /Design engineering/ }).click();
      await expect(page.getByText("No links in this folder yet")).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
    });

    test("a digit key switches folders and the URL stays /", async ({ page }) => {
      await openDemo(page);
      // Menu order is by name: 2 = Design engineering, 3 = Getting started, 4 = Reading list.
      await page.keyboard.press("3");
      await expect(page.getByRole("button", { name: "Folder: Getting started" })).toBeVisible();
      await expect(rows(page)).toHaveCount(2);
      await page.keyboard.press("2");
      await expect(page.getByText("No links in this folder yet")).toBeVisible();
      // 1 is Home, which would leave the page: it does nothing.
      await page.keyboard.press("1");
      await expect(page.getByRole("button", { name: "Folder: Design engineering" })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("share popover: Public is on and locked; Copy copies the shared link", async ({ page, context, browserName }) => {
      if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openDemo(page);
      await page.getByRole("button", { name: "Public, sharing settings" }).click();
      const toggle = page.getByRole("switch", { name: "Public" });
      await expect(toggle).toBeChecked();
      await expect(toggle).toBeDisabled();

      await page.getByRole("button", { name: "Copy link" }).click();
      await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
      if (browserName === "chromium") {
        const origin = new URL(page.url()).origin;
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/@purl/reading-list`);
      }
    });

    test("account menu: Grid shows cards without saving; account items are disabled", async ({ page }) => {
      const { apiRequests } = watch(page);
      await openDemo(page);
      await page.getByRole("button", { name: "Account menu" }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByText("@purl")).toBeVisible();
      for (const name of ["Share feedback", "Settings", "Log out", "Folder tags"]) {
        await expect(menu.getByRole(name === "Folder tags" ? "menuitemcheckbox" : "menuitem", { name })).toHaveAttribute(
          "aria-disabled",
          "true",
        );
      }
      await menu.getByRole("menuitem", { name: "View mode" }).click();
      await page.getByRole("menuitemradio", { name: "Grid" }).click();

      await expect(page.locator('[data-cy="link-card"]')).toHaveCount(4);
      expect(apiRequests.filter((url) => url.includes("/api/user/layout"))).toEqual([]);
    });

    test("opening a row pops up the link; no API request and no console error across a session", async ({ page }) => {
      const { apiRequests, consoleErrors } = watch(page);
      await openDemo(page);

      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        page.getByRole("link", { name: /Reading 1/ }).click(),
      ]);
      expect(popup.url()).toContain("https://example.com/reading-1");
      await popup.close();

      // Folder menu, share popover and account menu in one session.
      await page.getByRole("button", { name: "Folder: Reading list" }).click();
      await page.getByRole("menuitem", { name: /Getting started/ }).click();
      await page.getByRole("button", { name: "Public, sharing settings" }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");

      expect(apiRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test("hovering a PDF row previews it without the PDF proxy", async ({ page, isMobile }) => {
      test.skip(isMobile, "hover previews are desktop only");
      const { apiRequests } = watch(page);
      await openDemo(page);
      await page.getByRole("link", { name: /Paper/ }).hover();
      await expect(page.getByText("Paper").nth(1)).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(apiRequests).toEqual([]);
    });

    test("?settings= opens no Settings dialog and calls no API", async ({ page }) => {
      const { apiRequests } = watch(page);
      await page.context().route(/^https:\/\/example\.com\//, (route) =>
        route.fulfill({ contentType: "image/png", body: PNG_1X1 }),
      );
      await page.goto("/?settings=account");
      await expect(page.getByRole("button", { name: "Folder: Reading list" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(apiRequests).toEqual([]);
    });
  });
});
