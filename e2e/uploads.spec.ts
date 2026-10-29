import { del, list } from "@vercel/blob";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { expect, test, waitForHydration } from "./fixtures";

// Uploads against a real Vercel Blob store: the file goes up, its card shows
// the stored image, Settings → Usage counts it, and deleting the pearl
// removes it. Opt in with E2E_REAL_BLOB=1 and a real BLOB_READ_WRITE_TOKEN in
// .env.e2e (a dev store, never production's). Everything this spec stores
// under the test user's prefix is deleted after each test. The entry points
// themselves are covered offline by `upload-entry-points.spec.ts`.

test.skip(process.env.E2E_REAL_BLOB !== "1", "needs a real Blob store");

const BLOB_HOST = ".public.blob.vercel-storage.com";
const cards = (page: Page) => page.locator('[data-cy="link-card"]');
const pending = (page: Page) => page.locator('[data-cy="pending-upload"]');

/** A 256×256 noise PNG (about 190 KB), so the Usage line reads above 0 KB. */
async function noisePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  })
    .png()
    .toBuffer();
}

async function chooseGrid(page: Page) {
  const saved = page.waitForResponse(
    (res) => res.url().endsWith("/api/user/layout") && res.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Grid view" }).click();
  expect((await saved).ok()).toBe(true);
}

async function openHomeInGrid(page: Page) {
  await page.goto("/home");
  await waitForHydration(page, '[data-cy="upload-input"]');
  await chooseGrid(page);
}

/** Expects `count` cards, the newest showing an image stored in Blob. */
async function expectStoredCards(page: Page, count: number) {
  await expect(pending(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(cards(page)).toHaveCount(count);
  await expect(cards(page).first().locator(`img[src*="${BLOB_HOST}"]`)).toBeVisible();
}

test.describe("Uploads (real Blob store)", () => {
  test.afterEach(async ({ testUser }) => {
    // Everything under the user's prefix, page by page.
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `users/${testUser.id}/`, cursor });
      if (page.blobs.length > 0) await del(page.blobs.map((blob) => blob.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  });

  test("U uploads a file: pending card, stored card, Usage, delete", async ({ page }) => {
    await openHomeInGrid(page);
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("u");
    await (await chooser).setFiles({
      name: "noise.png",
      mimeType: "image/png",
      buffer: await noisePng(),
    });
    await expect(pending(page)).toHaveCount(1);
    await expectStoredCards(page, 1);

    // Settings → Usage counts the stored bytes.
    await page.goto("/home?settings=usage");
    const storage = page.getByRole("dialog").locator('[data-slot="item"]', { hasText: "Storage" });
    await expect(storage).toBeVisible();
    await expect(storage).not.toContainText("0 KB /");
    await page.keyboard.press("Escape");

    // Delete through the card's menu; once the Undo window has passed the
    // delete is sent, and the card stays gone after a reload.
    const card = cards(page).first();
    await card.hover();
    await card.getByRole("button", { name: "Open link menu" }).click();
    const deleted = page.waitForResponse(
      (res) => /\/api\/links/.test(res.url()) && res.request().method() === "DELETE",
      { timeout: 15_000 },
    );
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(cards(page)).toHaveCount(0);
    expect((await deleted).ok()).toBe(true);
    await page.reload();
    await waitForHydration(page, '[data-cy="upload-input"]');
    await expect(cards(page)).toHaveCount(0);
  });

  test("a dropped file and a pasted file each become a card", async ({ page }) => {
    await openHomeInGrid(page);
    const bytes = Array.from(await noisePng());

    await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer };
      document.body.dispatchEvent(new DragEvent("dragenter", init));
      document.body.dispatchEvent(new DragEvent("dragover", init));
      document.body.dispatchEvent(new DragEvent("drop", init));
    }, bytes);
    await expectStoredCards(page, 1);

    await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    }, bytes);
    await expectStoredCards(page, 2);
  });
});
