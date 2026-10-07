import { expect, test } from "./fixtures";

// The landing page: content, the first-visit arrival (CSS only, remembered in
// localStorage so later visits skip it) and the fallbacks that keep the page
// readable without it.

test.use({ signedIn: false });

const SEEN_KEY = "purl:landing-seen";
const WORDS = "[data-landing-word]";

const FOOTER_LINKS = [
  { name: "API", href: "/docs/api" },
  { name: "MCP", href: "/docs/mcp" },
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
        "The calm read-it-later app. Save links, PDFs, videos and audio to one quiet list, and read them when you're ready.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
    await expect(page.getByText("Free · 1,000 links · No ads · No AI")).toBeVisible();

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "@nublson" })).toHaveAttribute("href", "https://github.com/nublson");
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

    test("only fades: no blur or movement keyframes, and no sheen", async ({ page }) => {
      await page.goto("/");
      const names = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel)).map((el) => getComputedStyle(el).animationName);
      }, WORDS);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(name).toBe("landing-fade");
        expect(name).not.toBe("landing-arrive");
      }
      const sheen = await page.evaluate(() => {
        const el = document.querySelector("[data-pearl-word]");
        return el ? getComputedStyle(el).animationName : null;
      });
      expect(sheen).toBe("none");
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
