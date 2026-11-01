import type { Locator, Page } from "@playwright/test";
import { chooseView, expect, test, waitForHydration } from "./fixtures";
import { pool } from "./support/db";

// A private note on a link: written in the Edit dialog, marked on the row
// and the card with a button that opens the note, shown in the hover
// preview, found by the search, and never shown on the shared folder page
// or its feed.

const rows = (page: Page) => page.locator('[data-cy="link-item"]');
const noteMark = (scope: Page | Locator) => scope.getByRole("button", { name: "Note" });
const notePopover = (page: Page) => page.locator('[data-cy="note-popover"]');

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

    await expect(noteMark(rows(page))).toHaveCount(0);

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

    // The mark is the last thing on the title line, after the domain.
    const mark = noteMark(rows(page).first());
    await expect(mark).toBeVisible();
    const domain = rows(page).first().getByText("example.com", { exact: true });
    const [markBox, domainBox] = await Promise.all([mark.boundingBox(), domain.boundingBox()]);
    expect(markBox!.x).toBeGreaterThan(domainBox!.x + domainBox!.width - 1);
    // Its box is the line's height: the row keeps its 48px.
    const rowBox = (await rows(page).first().boundingBox())!;
    expect(Math.abs(rowBox.height - 48)).toBeLessThanOrEqual(1);

    await rows(page).first().hover();
    const preview = page.locator('[data-slot="hover-card-content"]');
    await expect(preview).toContainText("Remember the swallow");

    // The grid's page card carries the mark beside its domain.
    await chooseView(page, "Grid");
    await expect(noteMark(page.locator('[data-cy="link-card"]'))).toBeVisible();
  });

  test("the mark opens the note: on hover at once, on a click until Escape", async ({
    page,
    seed,
  }) => {
    const id = await seed.link({ url: "https://example.com/notes", title: "Noted" });
    await setNotes(id, "Remember the swallow\nSecond line");
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    const mark = noteMark(rows(page).first());
    await expect(mark).toHaveAttribute("aria-expanded", "false");

    // Hover: the note shows at once, and the row's own preview stays shut.
    await mark.hover();
    await expect(notePopover(page)).toContainText("Remember the swallow");
    await expect(mark).toHaveAttribute("aria-expanded", "true");
    await page.waitForTimeout(600);
    await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0);
    // Line breaks are kept.
    expect(
      await notePopover(page).evaluate((el) => getComputedStyle(el).whiteSpace),
    ).toBe("pre-line");

    // Leaving the mark closes a hovered note.
    await page.mouse.move(5, 5);
    await expect(notePopover(page)).toHaveCount(0);

    // A click keeps it open until Escape, which hands focus back to the mark.
    await mark.click();
    await expect(notePopover(page)).toBeVisible();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await expect(notePopover(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notePopover(page)).toHaveCount(0);
    await expect(mark).toBeFocused();
    // Nothing navigated: the row's link wasn't followed.
    expect(page.context().pages()).toHaveLength(1);
    await expect(page).toHaveURL(/\/home$/);

    // The keyboard opens it from the mark, which is a Tab stop after the link.
    await page.keyboard.press("Enter");
    await expect(notePopover(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notePopover(page)).toHaveCount(0);

    // The grid's card: the mark opens the note, not the link.
    await chooseView(page, "Grid");
    const cardMark = noteMark(page.locator('[data-cy="link-card"]').first());
    await cardMark.click();
    await expect(notePopover(page)).toContainText("Remember the swallow");
    expect(page.context().pages()).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(notePopover(page)).toHaveCount(0);
    await expect(cardMark).toBeFocused();
  });

  test("a long title never puts the mark under the row's floating actions", async ({
    page,
    seed,
  }) => {
    const long = "A title long enough to run past the end of the row ".repeat(6);
    const folder = await seed.folder({ name: "Reading", slug: "reading" });
    const unfiled = await seed.link({ url: "https://example.com/notes", title: long });
    await setNotes(unfiled, "Remember the swallow");
    const filed = await seed.link({
      url: "https://example.org/notes",
      title: `Filed ${long}`,
      folderId: folder,
    });
    await setNotes(filed, "Remember the heron");
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    for (const [row, text] of [
      [rows(page).filter({ hasText: "Filed" }), "heron"],
      [rows(page).filter({ hasNotText: "Filed" }), "swallow"],
    ] as const) {
      // Hovering the row floats its actions over its end (the folder button
      // and ⋯ for the filed one); the mark stays clear and takes the click.
      await row.hover();
      await expect(row.getByRole("button", { name: "Open link menu" })).toBeVisible();
      const mark = noteMark(row);
      const [markBox, menuBox] = await Promise.all([
        mark.boundingBox(),
        row.getByRole("button", { name: "Open link menu" }).boundingBox(),
      ]);
      expect(markBox!.x + markBox!.width).toBeLessThan(menuBox!.x - 24);
      await mark.click({ trial: true });
      await mark.click();
      await expect(notePopover(page)).toContainText(text);
      await page.keyboard.press("Escape");
      await expect(notePopover(page)).toHaveCount(0);
    }
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
    await expect(noteMark(page)).toHaveCount(0);
    expect(await page.content()).not.toContain("swallow");

    const feed = await page.request.get(`/@${testUser.username}/shared/feed.xml`);
    expect(feed.ok()).toBe(true);
    expect(await feed.text()).not.toContain("swallow");
  });
});

test.describe("The Edit dialog on a short screen", () => {
  test.use({ viewport: { width: 390, height: 520 } });

  test("a long note scrolls inside the dialog and Save stays reachable", async ({
    page,
    seed,
  }) => {
    const id = await seed.link({ url: "https://example.com/notes", title: "Noted" });
    await setNotes(id, "A line of the note\n".repeat(60));
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label="Open link menu"]');

    await rows(page).first().hover();
    await page.getByRole("button", { name: "Open link menu" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit link" });
    await expect(dialog).toBeVisible();
    // Capped at the screen less its 16px margins: the form scrolls inside.
    const box = (await dialog.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(520 - 32 + 1);
    expect(box.y).toBeGreaterThanOrEqual(15);

    const save = dialog.getByRole("button", { name: "Save changes" });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await dialog.getByRole("textbox", { name: "Title" }).fill("Noted again");
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(rows(page).first()).toContainText("Noted again");
  });
});

test.describe("Link notes on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a tap on the mark opens the note, not the link, and doesn't select the row", async ({
    page,
    seed,
  }) => {
    // A long title: on touch the ⋯ always floats over the row's end, and
    // the mark must stay clear of it.
    const id = await seed.link({
      url: "https://example.com/notes",
      title: "A title long enough to run past the end of the row ".repeat(6),
    });
    await setNotes(id, "Remember the swallow\nSecond line");
    await page.goto("/home");
    await waitForHydration(page, '[data-cy="link-item"]');
    await page.waitForLoadState("networkidle");

    const row = rows(page).first();
    const mark = noteMark(row);
    await expect(mark).toBeVisible();
    // A phone's row keeps its 56px with the mark on it.
    const rowBox = (await row.boundingBox())!;
    expect(Math.abs(rowBox.height - 56)).toBeLessThanOrEqual(1);
    const box = (await mark.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(notePopover(page)).toContainText("Remember the swallow");
    expect(page.context().pages()).toHaveLength(1);
    await expect(row).not.toHaveAttribute("data-selected");
    await expect(page.getByText("1 selected")).toHaveCount(0);

    // A tap outside closes it.
    await page.touchscreen.tap(200, 700);
    await expect(notePopover(page)).toHaveCount(0);
  });
});
