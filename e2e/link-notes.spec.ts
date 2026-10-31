import type { Page } from "@playwright/test";
import { chooseView, expect, test, waitForHydration } from "./fixtures";
import { pool } from "./support/db";

// A private note on a link: written in the Edit dialog, marked on the row,
// shown in the hover preview, found by the search, and never shown on the
// shared folder page or its feed.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');

async function setNotes(id: string, notes: string) {
  await pool.query('UPDATE "links" SET "notes" = $1 WHERE "id" = $2', [notes, id]);
}

test.describe("Link notes", () => {
  test("a note is written in the Edit dialog, marked on the row and shown in the preview", async ({
    page,
    seed,
  }) => {
    await seed.link({ url: "https://example.com/notes", title: "Noted" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    await expect(rows(page).getByRole("img", { name: "Has a note" })).toHaveCount(0);

    await rows(page).first().hover();
    await page.getByRole("button", { name: "Open link menu" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit link" });
    const notes = dialog.getByRole("textbox", { name: "Notes" });
    await expect(notes).toHaveAccessibleDescription("Only you see these.");

    // Over the cap: the server's message shows under the field.
    await notes.fill("a".repeat(2001));
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(notes).toHaveAccessibleDescription(
      "Only you see these. Keep the note to 2,000 characters or fewer.",
    );
    await expect(notes).toHaveAttribute("aria-invalid", "true");

    await notes.fill("Remember the swallow\nSecond line");
    await expect(notes).not.toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    // The row menu stays open behind the dialog: close it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();

    await expect(rows(page).first().getByRole("img", { name: "Has a note" })).toBeVisible();

    await rows(page).first().hover();
    const preview = page.locator('[data-slot="hover-card-content"]');
    await expect(preview).toContainText("Remember the swallow");

    // The grid's page card carries the mark beside its domain.
    await chooseView(page, "Grid");
    await expect(
      page.locator('[data-cy="link-card"]').getByRole("img", { name: "Has a note" }),
    ).toBeVisible();
  });

  test("search finds a link by a word only in its note", async ({ page, seed }) => {
    const id = await seed.link({ url: "https://example.com/notes", title: "Noted" });
    await setNotes(id, "Remember the swallow\nSecond line");
    await seed.link({ url: "https://example.org/other", title: "Other" });
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    const search = page.getByRole("searchbox", { name: /Search your links/ });
    await search.fill("swallow");
    await expect(rows(page).filter({ hasText: "Noted" })).toBeVisible();
    await expect(rows(page).filter({ hasText: "Other" })).toHaveCount(0);

    await search.fill("zzz-nothing");
    await expect(page.getByText("No links match “zzz-nothing”")).toBeVisible();
  });
});

test.describe("Link notes on a shared folder", () => {
  test.use({ signedIn: false });

  test("the shared page shows neither the mark nor the note", async ({
    page,
    seed,
    testUser,
  }) => {
    const folder = await seed.folder({ name: "Shared", slug: "shared", isPublic: true });
    const id = await seed.link({
      url: "https://example.com/notes",
      title: "Noted",
      folderId: folder,
    });
    await setNotes(id, "Remember the swallow\nSecond line");

    await page.goto(`/@${testUser.username}/shared`);
    await expect(page.locator('[data-cy="link-card"]', { hasText: "Noted" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Has a note" })).toHaveCount(0);
    expect(await page.content()).not.toContain("swallow");

    const feed = await page.request.get(`/@${testUser.username}/shared/feed.xml`);
    expect(feed.ok()).toBe(true);
    expect(await feed.text()).not.toContain("swallow");
  });
});
