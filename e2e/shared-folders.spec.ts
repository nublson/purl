import { expect, test, waitForHydration } from "./fixtures";

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
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.getByRole("link", { name: "Purl" })).toHaveAttribute("href", "/");
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

      // Rename: the slug changes, and the old URL redirects to the new one.
      const rename = await page.request.patch(`/api/folders/${id}`, {
        data: { name: "Design Engineering" },
      });
      expect((await rename.json()).slug).toBe("design-engineering");
      const old = await visit(`/@${testUser.username}/design`);
      expect(old.status()).toBe(308);
      expect(old.headers().location).toContain(`/@${testUser.username}/design-engineering`);

      // Private again: both URLs 404.
      await page.request.patch(`/api/folders/${id}`, { data: { isPublic: false } });
      expect((await visit(`/@${testUser.username}/design-engineering`)).status()).toBe(404);
      expect((await visit(`/@${testUser.username}/design`)).status()).toBe(404);
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
      await dialog.getByRole("switch", { name: "Public" }).click();
      await expect(dialog.getByRole("switch", { name: "Public" })).toBeChecked();
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
