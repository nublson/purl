import { expect, test, waitForHydration } from "./fixtures";

// New folders suggest an emoji from their name until one is picked.

test.use({ colorScheme: "dark" });

test("the name suggests an emoji, which is saved unless you pick one", async ({ page }, testInfo) => {
  await page.goto("/home");
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.getByRole("button", { name: "Folder: Home" }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  const emojiButton = dialog.getByRole("button", { name: /^Folder emoji:/ });

  await expect(emojiButton).toHaveAccessibleName("Folder emoji: 🦪. Choose another");
  await dialog.getByLabel("Folder name").fill("Reading list");
  await expect(emojiButton).toHaveAccessibleName("Folder emoji: 📚 (suggested). Choose another");
  await page.screenshot({ path: testInfo.outputPath("suggestion.png") });

  // No known topic: back to the oyster.
  await dialog.getByLabel("Folder name").fill("Xyzzy");
  await expect(emojiButton).toHaveAccessibleName("Folder emoji: 🦪. Choose another");

  await dialog.getByLabel("Folder name").fill("Weekend recipes");
  await expect(emojiButton).toContainText("🍳");
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("button", { name: "Folder: Weekend recipes" })).toContainText("🍳");
});

test("editing a folder doesn't suggest over its emoji", async ({ page, seed }) => {
  await seed.folder({ name: "Stuff", slug: "stuff", emoji: "🧸" });
  await page.goto("/folders/stuff");
  await waitForHydration(page, 'button[aria-label^="Folder:"]');
  await page.getByRole("button", { name: "Folder: Stuff" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit folder" });
  await dialog.getByLabel("Folder name").fill("Music");
  await expect(dialog.getByRole("button", { name: /^Folder emoji:/ })).toHaveAccessibleName(
    "Folder emoji: 🧸. Choose another",
  );
});
