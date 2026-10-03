import { expect, test, waitForHydration } from "./fixtures";

// The folder emoji picker's skin tones. Emoji data loads from jsDelivr, so
// this needs network access.

test.use({ colorScheme: "dark" });

test("pick a skin tone, choose a toned emoji, and the tone is remembered", async ({ page }, testInfo) => {
  await page.goto("/home");
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.getByRole("button", { name: "Folder: Home" }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  await dialog.getByLabel("Folder name").fill("Toned");

  await dialog.getByRole("button", { name: /^Folder emoji:/ }).click();
  await page.getByRole("button", { name: "Choose skin tone" }).click();
  const tones = page.getByRole("radiogroup", { name: "Skin tone" });
  await expect(tones.getByRole("radio")).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath("skin-tones.png") });
  await tones.getByRole("radio", { name: "Dark skin tone", exact: true }).click();

  // The grid now shows dark-toned emoji: search one and pick it.
  await page.getByPlaceholder("Search…").fill("waving hand");
  await page.getByRole("gridcell", { name: /waving hand/i }).first().click();
  await expect(dialog.getByRole("button", { name: /^Folder emoji: 👋🏿/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page).toHaveURL(/\/folders\/toned$/);
  await expect(page.getByRole("button", { name: "Folder: Toned" })).toContainText("👋🏿");

  // Next time the picker opens with the same tone.
  await page.getByRole("button", { name: "Folder: Toned" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Folder emoji:/ }).click();
  await expect(page.locator('[data-slot="emoji-picker-skin-tone-trigger"]')).toHaveText("✋🏿");
});

test("the skin tones are one Tab stop, and arrows move between them", async ({ page }) => {
  await page.goto("/home");
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.getByRole("button", { name: "Folder: Home" }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Folder emoji:/ }).click();
  await page.getByRole("button", { name: "Choose skin tone" }).click();

  const tones = page.getByRole("radiogroup", { name: "Skin tone" });
  // Focus lands on the checked tone; only it is in the Tab order.
  await expect(tones.getByRole("radio", { checked: true })).toBeFocused();
  await expect(tones.locator('[tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press("ArrowRight");
  const light = tones.getByRole("radio", { name: "Light skin tone", exact: true });
  await expect(light).toBeFocused();
  await expect(light).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(tones.getByRole("radio", { name: "Dark skin tone", exact: true })).toBeFocused();

  // Enter confirms and closes.
  await page.keyboard.press("Enter");
  await expect(tones).toHaveCount(0);
});
