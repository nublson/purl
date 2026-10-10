import { getAuthorUrl } from "../src/lib/author-url";
import { expect, test, waitForHydration } from "./fixtures";

// The landing page: content, the first-visit arrival (CSS only, remembered in
// localStorage so later visits skip it) and the fallbacks that keep the page
// readable without it.

test.use({ signedIn: false });

const SEEN_KEY = "purl:landing-seen";
const WORDS = "[data-landing-word]";

const FOOTER_LINKS = [
  { name: "API", href: "/docs/api" },
  { name: "MCP", href: "/docs/mcp" },
  { name: "Support", href: "/support" },
  { name: "Privacy", href: "/privacy" },
  { name: "Terms", href: "/terms" },
  { name: "GitHub", href: "https://github.com/nublson/purl" },
];

test.describe("Landing page", () => {
  test("shows the headline, sub-headline, sign-in buttons, free line and footer links", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "A home for your pearls" })).toBeVisible();
    await expect(
      page.getByText(
        "Save the links worth keeping, all in one calm place. Share a folder when one’s worth passing on.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
    await expect(page.getByText("Free · 1,000 links · No ads · No AI")).toBeVisible();

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "@nublson" })).toHaveAttribute("href", getAuthorUrl());
    for (const { name, href } of FOOTER_LINKS) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
  });

  test("first visit plays the arrival and remembers it; the next load is settled", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-landing-seen", /.*/);

    const running = () => page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel)).reduce((n, el) => n + el.getAnimations().length, 0);
    }, WORDS);
    expect(await running()).toBeGreaterThan(0);

    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), SEEN_KEY), { timeout: 4000 })
      .toBe("1");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-landing-seen", /.*/);
    expect(await running()).toBe(0);
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("only fades: no blur or movement keyframes", async ({ page }) => {
      await page.goto("/");
      const names = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel)).map((el) => getComputedStyle(el).animationName);
      }, WORDS);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(name).toBe("landing-fade");
        expect(name).not.toBe("landing-arrive");
      }
    });
  });

  test("without scripts the content still ends up fully visible", async ({ page }) => {
    await page.route("**/*", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/");

    const opacity = (selector: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).opacity : null;
      }, selector);

    for (const selector of ["h1", '[data-landing-block="actions"]', "[data-landing-panel]"]) {
      await expect.poll(() => opacity(selector), { timeout: 3000, message: selector }).toBe("1");
    }
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test.describe("small screens", () => {
    test.use({ viewport: { width: 320, height: 700 } });

    test("does not scroll sideways at 320px", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(320);
    });
  });

  test.describe("after logging out", () => {
    test.use({ signedIn: true });

    test("a returning visitor lands on the settled page, with no script warning", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.addInitScript((key) => window.localStorage.setItem(key, "1"), SEEN_KEY);

      await page.goto("/home");
      await waitForHydration(page, '[aria-label="Account menu"]');
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Log out" }).click();

      // Log out is a client navigation to "/", so no full load runs the head script.
      await expect(page.getByRole("heading", { level: 1, name: "A home for your pearls" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-landing-seen", /.*/);
      const running = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel)).reduce((n, el) => n + el.getAnimations().length, 0);
      }, WORDS);
      expect(running).toBe(0);
      expect(errors.filter((e) => e.includes("Encountered a script tag"))).toEqual([]);
    });
  });

  test("screenshots at phone and desktop widths, dark and light", async ({ page }, testInfo) => {
    // Land on the settled page so the shots don't catch the arrival mid-way.
    await page.addInitScript((key) => window.localStorage.setItem(key, "1"), SEEN_KEY);
    for (const colorScheme of ["dark", "light"] as const) {
      for (const width of [390, 1440]) {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("data-landing-seen", /.*/);
        await page.screenshot({
          path: testInfo.outputPath(`landing-${colorScheme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  });
});
