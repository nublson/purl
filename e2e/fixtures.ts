import { test as base, expect, type Page } from "@playwright/test";
import { sessionCookies } from "./support/auth";
import {
  createTestUser,
  deleteTestUser,
  resetTestUserData,
  seedFolder,
  seedLink,
  type TestUser,
} from "./support/db";

type WorkerFixtures = {
  /**
   * One `@purl.test` user per worker and project, so tests running in
   * parallel (or in both browsers) never share data. Deleted at the end.
   */
  testUser: TestUser;
};

type TestFixtures = {
  /** Whether the test's browser context is signed in as `testUser` (default true). */
  signedIn: boolean;
  /** Seeding helpers bound to `testUser`. */
  seed: {
    link: (link: { url: string; title?: string; folderId?: string }) => Promise<string>;
    folder: (folder: { name: string; slug: string; emoji?: string }) => Promise<string>;
  };
};

// Fixture callbacks name Playwright's `use` argument `provide`, so the
// React-hooks lint rule doesn't mistake it for React's `use` hook.
export const test = base.extend<TestFixtures, WorkerFixtures>({
  testUser: [
    async ({}, provide, workerInfo) => {
      const tag = `${workerInfo.project.name}-w${workerInfo.parallelIndex}`;
      const user = await createTestUser(`e2e-${tag}@purl.test`, `E2E ${tag}`);
      await provide(user);
      await deleteTestUser(user.id);
    },
    { scope: "worker" },
  ],

  signedIn: [true, { option: true }],

  // Every test starts with no links or folders, signed in unless the test
  // opts out with `test.use({ signedIn: false })`.
  context: async ({ context, testUser, signedIn, baseURL }, provide) => {
    await resetTestUserData(testUser.id);
    if (signedIn) {
      await context.addCookies(await sessionCookies(testUser.id, baseURL!));
    }
    await provide(context);
  },

  seed: async ({ testUser }, provide) => {
    await provide({
      link: (link) => seedLink(testUser.id, link),
      folder: (folder) => seedFolder(testUser.id, folder),
    });
  },
});

export { expect };

/**
 * Waits until React has hydrated the element `selector` matches. Pages are
 * server-rendered, so controls exist (and Playwright considers them
 * actionable) before React attaches their handlers; on a cold dev server a
 * click in that gap does nothing. React adds `__reactFiber…` keys to an
 * element when it hydrates it.
 */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const element = document.querySelector(sel);
      return (
        !!element &&
        Object.keys(element).some((key) => key.startsWith("__reactFiber"))
      );
    },
    selector,
  );
}
