import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

// The three ways files get in (the + menu and `U`, a drop, a paste) and the
// drop overlay. No Blob store runs locally, so the token route is answered
// in the browser with the storage limit: every upload starts (its pending
// item shows), then fails with the server's message and Retry, and nothing
// reaches Blob. The real round trip is `uploads.spec.ts` (E2E_REAL_BLOB=1).

const PIXEL = path.join(__dirname, "fixtures", "uploads", "pixel.png");
const PIXEL_BYTES = Array.from(readFileSync(PIXEL));
const STORAGE_FULL =
  "Your 250 MB of storage is full. Delete files you no longer need to upload more.";

const pending = (page: Page) => page.locator('[data-cy="pending-upload"]');
const overlay = (page: Page) => page.locator('[data-cy="drop-overlay"]');

/** Answers every token request with the storage limit, so nothing reaches Blob. */
async function refuseTokens(page: Page) {
  await page.route("**/api/uploads/token", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: STORAGE_FULL,
        code: "LIMIT_REACHED",
        feature: "STORAGE_LIMIT",
      }),
    }),
  );
}

async function openHome(page: Page) {
  await refuseTokens(page);
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');
}

/** The file started, the limit toasted the server's message, and it ended failed with Retry. */
async function expectFailedUpload(page: Page) {
  await expect(pending(page)).toHaveCount(1);
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: STORAGE_FULL }),
  ).toBeVisible();
  await expect(pending(page)).toHaveAttribute("data-status", "failed");
  await expect(
    pending(page).getByRole("button", { name: "Retry uploading pixel.png" }),
  ).toBeVisible();
}

/**
 * Drags `pixel.png` (or `text`) from the desktop onto the page: dragenter,
 * dragover, then (unless `drop` is false) drop, on `document.body`. Returns
 * whether the page let the drop through (false: it took it).
 */
async function drag(
  page: Page,
  what: { file: true } | { text: string; type?: string },
  { drop = true }: { drop?: boolean } = {},
) {
  return page.evaluate(
    ({ bytes, what, drop }) => {
      const transfer = new DataTransfer();
      if ("file" in what) {
        transfer.items.add(
          new File([new Uint8Array(bytes)], "pixel.png", { type: "image/png" }),
        );
      } else {
        transfer.setData(what.type ?? "text/plain", what.text);
      }
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer };
      document.body.dispatchEvent(new DragEvent("dragenter", init));
      document.body.dispatchEvent(new DragEvent("dragover", init));
      if (!drop) return true;
      return document.body.dispatchEvent(new DragEvent("drop", init));
    },
    { bytes: PIXEL_BYTES, what, drop },
  );
}

/** A `dragleave` on `document.body` at (`x`, `y`); 0,0 is how a leave out of the window reads. */
async function dragLeave(page: Page, { x = 0, y = 0 }: { x?: number; y?: number } = {}) {
  await page.evaluate(
    ({ x, y }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["x"], "x.png", { type: "image/png" }));
      document.body.dispatchEvent(
        new DragEvent("dragleave", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: x,
          clientY: y,
        }),
      );
    },
    { x, y },
  );
}

test.describe("Upload entry points", () => {
  test("U opens the file picker; the chosen file starts and fails at the limit", async ({ page }) => {
    await openHome(page);
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("u");
    await (await chooser).setFiles(PIXEL);
    await expectFailedUpload(page);
    // Reset, so choosing the same file again still fires a change.
    await expect(page.locator('[data-cy="upload-input"]')).toHaveValue("");
  });

  test("U does nothing while typing in the search field", async ({ page }) => {
    await openHome(page);
    let opened = false;
    page.on("filechooser", () => {
      opened = true;
    });
    const field = page.getByLabel("Search your links or paste a link to save");
    await field.focus();
    await page.keyboard.press("u");
    await expect(field).toHaveValue("u");
    await page.waitForTimeout(300);
    expect(opened).toBe(false);
  });

  test("dropping a file uploads it", async ({ page }) => {
    await openHome(page);
    // The page takes the drop, so the browser never opens the file.
    expect(await drag(page, { file: true })).toBe(false);
    await expect(overlay(page)).toHaveCount(0);
    await expectFailedUpload(page);
  });

  test("dropping a folder uploads nothing and says why", async ({ page }) => {
    await openHome(page);
    // A desktop folder arrives as an entry with no type and no size.
    const taken = await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([], "Holiday", { type: "" }));
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer };
      document.body.dispatchEvent(new DragEvent("dragenter", init));
      document.body.dispatchEvent(new DragEvent("dragover", init));
      return !document.body.dispatchEvent(new DragEvent("drop", init));
    });
    expect(taken).toBe(true);
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Folders can't be uploaded" }),
    ).toBeVisible();
    await expect(pending(page)).toHaveCount(0);
  });

  test("pasting a file uploads it", async ({ page }) => {
    await openHome(page);
    await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "pixel.png", { type: "image/png" }));
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    }, PIXEL_BYTES);
    await expectFailedUpload(page);
  });

  test("dragging files over Home shows the overlay; leaving hides it", async ({ page }) => {
    await openHome(page);
    await drag(page, { file: true }, { drop: false });
    await expect(overlay(page)).toBeVisible();
    await expect(overlay(page)).toHaveText("Drop to save");
    await dragLeave(page);
    await expect(overlay(page)).toHaveCount(0);
  });

  test("a leave out of the window or the window losing focus hides the overlay", async ({ page }) => {
    await openHome(page);
    // Two enters (the page, then an element in it): one leave inside the
    // window keeps the overlay.
    await drag(page, { file: true }, { drop: false });
    await drag(page, { file: true }, { drop: false });
    await dragLeave(page, { x: 100, y: 100 });
    await expect(overlay(page)).toBeVisible();
    // Out of the window: gone, however many enters are unpaired.
    await dragLeave(page, { x: -5, y: 100 });
    await expect(overlay(page)).toHaveCount(0);

    await drag(page, { file: true }, { drop: false });
    await expect(overlay(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(overlay(page)).toHaveCount(0);
  });

  test("on a folder page the overlay names the folder, and the empty state mentions dropping", async ({ page, seed }) => {
    await seed.folder({ name: "Reading", slug: "reading", emoji: "📚" });
    await refuseTokens(page);
    await page.goto("/folders/reading");
    await waitForHydration(page, '[data-cy="upload-input"]');
    await expect(page.locator('[data-cy="link-group-empty"]')).toContainText(
      "or drop files here",
    );
    await drag(page, { file: true }, { drop: false });
    await expect(overlay(page)).toHaveText("Drop to save to 📚 Reading");
  });

  test("dragging text shows no overlay; dropping a URL saves it like a paste", async ({ page }) => {
    await openHome(page);
    const saved = new Promise<unknown>((resolve) => {
      void page.route("**/api/links", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        resolve(route.request().postDataJSON());
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Not this time" }),
        });
      });
    });
    expect(
      await drag(page, { text: "https://example.com/dropped", type: "text/uri-list" }),
    ).toBe(false);
    await expect(overlay(page)).toHaveCount(0);
    expect(await saved).toMatchObject({ url: "https://example.com/dropped" });
  });

  test("with Settings open the page ignores drags (the Import tab has its own)", async ({ page }) => {
    await refuseTokens(page);
    await page.goto("/home?settings=import");
    await waitForHydration(page, '[data-cy="import-file-input"]');
    await drag(page, { file: true }, { drop: false });
    await page.waitForTimeout(300);
    await expect(overlay(page)).toHaveCount(0);
    await expect(pending(page)).toHaveCount(0);
  });

  test("on another Settings tab a dropped file is taken, never uploaded", async ({ page }) => {
    await refuseTokens(page);
    await page.goto("/home?settings=usage");
    await waitForHydration(page, "[data-settings-dialog]");
    // Taken: the browser doesn't open the file and leave the app.
    expect(await drag(page, { file: true })).toBe(false);
    await expect(overlay(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(pending(page)).toHaveCount(0);
  });
});

test.describe("Upload entry points on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("the + menu is for pointers that hover: hidden on touch", async ({ page }) => {
    await page.goto("/home");
    await waitForHydration(page, 'button[aria-label^="Folder:"]');
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeHidden();
  });
});
