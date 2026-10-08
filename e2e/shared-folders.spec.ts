import { expect, test, waitForHydration } from "./fixtures";
import { setFolderPublic } from "./support/db";

// Public folders at /@username/slug: readable by anyone (no session),
// never indexed, 404 when private, and old URLs redirect after a rename.

test.describe("Shared folders, visited signed out", () => {
  test.use({ signedIn: false });

  test("a public folder shows the folder and its links, and isn't indexed", async ({
    page,
    seed,
    testUser,
  }) => {
    const design = await seed.folder({
      name: "Design",
      slug: "design",
      emoji: "🎨",
      description: "Things I keep coming back to",
      isPublic: true,
    });
    await seed.link({ url: "https://a.example", title: "Alpha article", folderId: design });
    await seed.link({ url: "https://b.example", title: "Not in the folder" });

    const response = await page.goto(`/@${testUser.username}/design`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Design");
    await expect(page.getByRole("link", { name: /Alpha article/ })).toHaveAttribute(
      "href",
      "https://a.example",
    );
    await expect(page.getByText("Not in the folder")).toHaveCount(0);
    await expect(page).toHaveTitle(`🎨 Design by @${testUser.username} · Purl`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      `🎨 Design by @${testUser.username} · Purl`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.getByText("Things I keep coming back to")).toBeVisible();
    // Footer: who shared it, and Made with Purl (links home).
    const footer = page.locator("footer");
    await expect(footer).toContainText("by");
    await expect(footer).toContainText(`@${testUser.username}`);
    await expect(footer.getByRole("link", { name: "Purl", exact: true })).toHaveAttribute(
      "href",
      "/",
    );
  });

  test("the view toggle switches between the list and a grid of cards", async ({
    page,
    seed,
    testUser,
  }, testInfo) => {
    const design = await seed.folder({ name: "Design", slug: "design", isPublic: true });
    for (const [i, title] of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].entries()) {
      await seed.link({
        url: `https://${title.toLowerCase()}.example`,
        title: `${title} article`,
        description: i % 2 ? `Notes about ${title}` : undefined,
        folderId: design,
      });
    }
    await page.goto(`/@${testUser.username}/design`);
    await waitForHydration(page, 'button[aria-label="Grid view"]');

    const list = page.getByRole("button", { name: "List view" });
    const grid = page.getByRole("button", { name: "Grid view" });
    await expect(list).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(5);

    await grid.click();
    await expect(grid).toHaveAttribute("aria-pressed", "true");
    await expect(list).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(0);
    const cards = page.locator('[data-cy="link-card"]');
    await expect(cards).toHaveCount(5);
    await expect(cards.filter({ hasText: "Bravo article" })).toContainText("bravo.example");
    await expect(cards.filter({ hasText: "Alpha article" })).toHaveAttribute(
      "href",
      "https://alpha.example",
    );
    if (process.env.SHARE_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.SHARE_SCREENSHOTS}/${testInfo.project.name}-grid.png` });
    }

    // The choice is remembered: a reload opens straight in the grid.
    await page.reload();
    await expect(page.locator('[data-cy="link-card"]')).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await waitForHydration(page, 'button[aria-label="Grid view"]');
    await page.getByRole("button", { name: "List view" }).click();
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(5);
    await page.reload();
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(5);
  });

  test("the grid has 2 columns on phones and 3 on small tablets, every card on screen", async ({
    page,
    seed,
    testUser,
  }) => {
    const design = await seed.folder({ name: "Design", slug: "design", isPublic: true });
    for (const title of ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]) {
      await seed.link({ url: `https://${title.toLowerCase()}.example`, title, folderId: design });
    }
    await page.setViewportSize({ width: 744, height: 1000 });
    await page.goto(`/@${testUser.username}/design`);
    await waitForHydration(page, 'button[aria-label="Grid view"]');
    await page.getByRole("button", { name: "Grid view" }).click();
    const cards = page.locator('[data-cy="link-card"]');
    await expect(cards).toHaveCount(6);
    const layout = async () => {
      const boxes = await cards.evaluateAll((all) =>
        all.map((el) => el.getBoundingClientRect()),
      );
      return {
        columns: new Set(boxes.map((box) => Math.round(box.left))).size,
        right: Math.max(...boxes.map((box) => box.right)),
      };
    };

    // Small tablets (an iPad mini's 744px portrait, and down to 640px).
    for (const width of [744, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(async () => (await layout()).columns).toBe(3);
      expect((await layout()).right).toBeLessThanOrEqual(width);
    }

    // Phones: two.
    await page.setViewportSize({ width: 500, height: 900 });
    await expect.poll(async () => (await layout()).columns).toBe(2);
    expect((await layout()).right).toBeLessThanOrEqual(500);
  });

  test("loading more in the grid shows placeholder cards, then the next page", async ({
    page,
    seed,
    testUser,
  }, testInfo) => {
    const design = await seed.folder({ name: "Design", slug: "design", isPublic: true });
    // One more than a page (PUBLIC_FOLDER_PAGE_SIZE = 50).
    for (let i = 0; i < 51; i++) {
      await seed.link({ url: `https://l${i}.example`, title: `Link ${i}`, folderId: design });
    }
    // A returning visitor who chose the grid.
    await page.context().addCookies([
      { name: "purl-shared-view", value: "grid", url: testInfo.project.use.baseURL! },
    ]);
    // Hold the next page until the placeholders have been seen.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/public/folders/**", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto(`/@${testUser.username}/design`);
    await expect(page.locator('[data-cy="link-card"]')).toHaveCount(50);
    await page.locator('[data-cy="link-card"]').last().scrollIntoViewIfNeeded();
    await expect(page.getByText("Loading more links")).toBeAttached();
    await expect(page.locator('ul[aria-label="Links"] .animate-pulse').first()).toBeVisible();
    if (process.env.SHARE_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.SHARE_SCREENSHOTS}/${testInfo.project.name}-grid-loading.png` });
    }
    release();
    await expect(page.locator('[data-cy="link-card"]')).toHaveCount(51);
    await expect(page.locator('ul[aria-label="Links"] .animate-pulse')).toHaveCount(0);
  });

  test("grid cards arrive on first load and with each new page, not on a view switch", async ({
    page,
    seed,
    testUser,
  }, testInfo) => {
    const design = await seed.folder({ name: "Design", slug: "design", isPublic: true });
    for (let i = 0; i < 51; i++) {
      await seed.link({ url: `https://m${i}.example`, title: `Card ${i}`, folderId: design });
    }
    await page.context().addCookies([
      { name: "purl-shared-view", value: "grid", url: testInfo.project.use.baseURL! },
    ]);
    // Count card arrivals in the page (200ms animations are too short to
    // catch from outside): animations that start on a grid cell's box.
    await page.addInitScript(() => {
      const w = window as Window & { __cardArrivals?: number };
      w.__cardArrivals = 0;
      document.addEventListener("animationstart", (event) => {
        const target = event.target as HTMLElement;
        if (target.parentElement?.tagName === "LI" && target.querySelector('[data-cy="link-card"]')) {
          w.__cardArrivals! += 1;
        }
      });
    });
    const arrivals = () =>
      page.evaluate(() => (window as Window & { __cardArrivals?: number }).__cardArrivals ?? 0);
    const reset = () =>
      page.evaluate(() => {
        (window as Window & { __cardArrivals?: number }).__cardArrivals = 0;
      });

    await page.goto(`/@${testUser.username}/design`);
    await expect(page.locator('[data-cy="link-card"]')).toHaveCount(50);
    await expect.poll(arrivals).toBeGreaterThan(0);

    // A view switch only fades the layout in: the cards don't arrive again.
    await waitForHydration(page, 'button[aria-label="Grid view"]');
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "List view" }).click();
    await reset();
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect(page.locator('[data-cy="link-card"]')).toHaveCount(50);
    await page.waitForTimeout(300);
    expect(await arrivals()).toBe(0);

    // The next page's card arrives.
    await page.locator('[data-cy="link-card"]').last().scrollIntoViewIfNeeded();
    await expect(page.locator('[data-cy="link-card"]')).toHaveCount(51);
    await expect.poll(arrivals).toBeGreaterThan(0);
  });

  test("a failed page stops loading more until Try again", async ({ page, seed, testUser }) => {
    const design = await seed.folder({ name: "Design", slug: "design", isPublic: true });
    for (let i = 0; i < 51; i++) {
      await seed.link({ url: `https://f${i}.example`, title: `Fail ${i}`, folderId: design });
    }
    let requests = 0;
    let fail = true;
    await page.route("**/api/public/folders/**", async (route) => {
      requests += 1;
      if (fail) await route.fulfill({ status: 429, body: "{}" });
      else await route.continue();
    });

    await page.goto(`/@${testUser.username}/design`);
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(50);
    await waitForHydration(page, 'button[aria-label="Grid view"]');
    // The page scrolls inside <main>; off-screen rows skip rendering
    // (content-visibility), which WebKit's scrollIntoView won't reach.
    await page.evaluate(() => {
      const main = document.querySelector("main")!;
      main.scrollTop = main.scrollHeight;
    });
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    // No retries on its own while the sentinel stays in view.
    await page.waitForTimeout(500);
    expect(requests).toBe(1);

    fail = false;
    await retry.click();
    await expect(page.locator('[data-cy="link-item"]')).toHaveCount(51);
    await expect(retry).toHaveCount(0);
  });

  test("the preview image renders for a public folder, and 404s once private", async ({
    page,
    seed,
    testUser,
  }) => {
    const design = await seed.folder({ name: "Design", slug: "design", emoji: "🎨", isPublic: true });
    await seed.link({ url: "https://a.example", title: "Alpha", folderId: design });
    await page.goto(`/@${testUser.username}/design`);
    const imageUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(imageUrl).toContain(`/u/${testUser.username}/design/opengraph-image`);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      `Design: 1 link, shared by @${testUser.username} on Purl`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );

    const path = new URL(imageUrl!).pathname + new URL(imageUrl!).search;
    const image = await page.request.get(path);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    expect((await image.body()).byteLength).toBeGreaterThan(1000);

    await setFolderPublic(design, false);
    expect((await page.request.get(path)).status()).toBe(404);
  });

  test("a private or missing folder is a 404, and so is an unknown user", async ({
    page,
    seed,
    testUser,
  }) => {
    await seed.folder({ name: "Hidden", slug: "hidden" });
    expect((await page.goto(`/@${testUser.username}/hidden`))?.status()).toBe(404);
    expect((await page.goto(`/@${testUser.username}/nope`))?.status()).toBe(404);
    expect((await page.goto(`/@no-such-user-xyz/hidden`))?.status()).toBe(404);
  });

  test("/u/... redirects to the /@ URL, and load more is public", async ({
    page,
    seed,
    testUser,
  }) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading", isPublic: true });
    await seed.link({ url: "https://a.example", title: "Alpha", folderId: reading });

    await page.goto(`/u/${testUser.username}/reading`);
    await expect(page).toHaveURL(new RegExp(`/@${testUser.username}/reading$`));

    const more = await page.request.get(
      `/api/public/folders/${testUser.username}/reading`,
    );
    expect(more.status()).toBe(200);
    const body = (await more.json()) as { links: { title: string }[]; nextCursor: string | null };
    expect(body.links.map((link) => link.title)).toEqual(["Alpha"]);
    // Only public fields.
    expect(Object.keys(body.links[0]).sort()).toEqual(
      [
        "contentType",
        "createdAt",
        "description",
        "domain",
        "favicon",
        "id",
        "thumbnail",
        "title",
        "url",
      ].sort(),
    );
  });
});

test.describe("Shared folders, managed by the owner", () => {
  test("sharing, renaming (old URL redirects) and unsharing", async ({ page, seed, testUser }) => {
    const id = await seed.folder({ name: "Design", slug: "design" });
    const visitor = await page.context().browser()!.newContext();
    const visit = (path: string) => visitor.request.get(path, { maxRedirects: 0 });

    try {
      expect((await visit(`/@${testUser.username}/design`)).status()).toBe(404);

      const share = await page.request.patch(`/api/folders/${id}`, { data: { isPublic: true } });
      expect(share.status()).toBe(200);
      expect((await share.json()).isPublic).toBe(true);
      expect((await visit(`/@${testUser.username}/design`)).status()).toBe(200);
      // The preview image's URL, as an app would have stored it when the
      // link was first shared.
      const sharedPage = await visitor.newPage();
      await sharedPage.goto(`/@${testUser.username}/design`);
      const imageUrl = new URL(
        (await sharedPage.locator('meta[property="og:image"]').getAttribute("content"))!,
      );
      const oldImage = imageUrl.pathname + imageUrl.search;
      await sharedPage.close();

      // Rename: the slug changes, and the old URL redirects to the new one.
      const rename = await page.request.patch(`/api/folders/${id}`, {
        data: { name: "Design Engineering" },
      });
      expect((await rename.json()).slug).toBe("design-engineering");
      const old = await visit(`/@${testUser.username}/design`);
      expect(old.status()).toBe(308);
      expect(old.headers().location).toContain(`/@${testUser.username}/design-engineering`);
      // The old preview image still draws (the folder as it is now).
      const image = await visit(oldImage);
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");

      // Private again: both URLs 404, and so does the old preview image.
      await page.request.patch(`/api/folders/${id}`, { data: { isPublic: false } });
      expect((await visit(`/@${testUser.username}/design-engineering`)).status()).toBe(404);
      expect((await visit(`/@${testUser.username}/design`)).status()).toBe(404);
      expect((await visit(oldImage)).status()).toBe(404);
    } finally {
      await visitor.close();
    }
  });

  test("changing your username keeps old shared URLs working", async ({ page, seed, testUser }) => {
    await seed.folder({ name: "Design", slug: "design", isPublic: true });
    const original = testUser.username;
    const renamed = `${original}-new`;
    const visitor = await page.context().browser()!.newContext();

    try {
      const change = await page.request.patch("/api/user/username", {
        data: { username: renamed },
      });
      expect(change.status()).toBe(200);

      const old = await visitor.request.get(`/@${original}/design`, { maxRedirects: 0 });
      expect(old.status()).toBe(308);
      expect(old.headers().location).toContain(`/@${renamed}/design`);
      expect((await visitor.request.get(`/@${renamed}/design`)).status()).toBe(200);
    } finally {
      // The worker's other tests use the original username.
      await page.request.patch("/api/user/username", { data: { username: original } });
      await visitor.close();
    }
  });
});

test.describe("Share popover", () => {
  test("the Public switch shares the folder and the link copies", async ({
    page,
    seed,
    testUser,
  }, testInfo) => {
    await seed.folder({ name: "Design", slug: "design" });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await page.goto("/folders/design");
    const share = page.getByRole("button", { name: "Share" });
    await waitForHydration(page, 'button[aria-label^="Folder:"]');
    await share.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Visibility")).toBeVisible();
    await expect(dialog.getByText(`/@${testUser.username}/design`)).toBeVisible();
    const copy = dialog.getByRole("button", { name: "Copy link" });
    await expect(copy).toBeDisabled();
    if (process.env.SHARE_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.SHARE_SCREENSHOTS}/${testInfo.project.name}-private.png` });
    }

    const visitor = await page.context().browser()!.newContext();
    try {
      // While sharing is still saving, the switch shows on but Copy waits
      // for the server.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/api/folders/*", async (route) => {
        if (route.request().method() === "PATCH") await held;
        await route.continue();
      });
      await dialog.getByRole("switch", { name: "Public" }).click();
      await expect(dialog.getByRole("switch", { name: "Public" })).toBeChecked();
      await expect(copy).toBeDisabled();
      release();
      await expect(copy).toBeEnabled();
      await expect(page.getByRole("button", { name: "Public, sharing settings" })).toBeVisible();
      // The switch is its own confirmation: no toast.
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await expect
        .poll(async () => (await visitor.request.get(`/@${testUser.username}/design`)).status())
        .toBe(200);
      if (process.env.SHARE_SCREENSHOTS) {
        await page.screenshot({ path: `${process.env.SHARE_SCREENSHOTS}/${testInfo.project.name}-public.png` });
      }

      await copy.click();
      await expect(dialog.getByRole("button", { name: "Link copied" })).toBeVisible();

      await dialog.getByRole("switch", { name: "Public" }).click();
      await expect(dialog.getByRole("switch", { name: "Public" })).not.toBeChecked();
      await expect
        .poll(async () => (await visitor.request.get(`/@${testUser.username}/design`)).status())
        .toBe(404);
    } finally {
      await visitor.close();
    }
  });
});

test.describe("The header's Share button", () => {
  for (const isPublic of [false, true]) {
    const name = isPublic ? "Public, sharing settings" : "Share";
    const label = isPublic ? "Public" : "Share";

    test(`${isPublic ? "public" : "private"}: labelled from lg, icon-only below`, async ({ page, seed }) => {
      await seed.folder({ name: "Design", slug: "design", isPublic });

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/folders/design");
      const button = page.getByRole("button", { name });
      // innerText: only what's rendered (the hidden label is still in the DOM).
      await expect(button).toHaveText(label, { useInnerText: true });

      // Just under Tailwind's lg (1024px): the icon alone, a 32px square,
      // with the same accessible name.
      await page.setViewportSize({ width: 1023, height: 800 });
      await expect(button).toHaveText("", { useInnerText: true });
      const box = (await button.boundingBox())!;
      expect(Math.round(box.width)).toBe(32);
      expect(Math.round(box.height)).toBe(32);
    });
  }
});
