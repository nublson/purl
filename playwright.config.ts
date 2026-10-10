import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Same env as the app: .env, then .env.local on top. The tests seed users and
// links in DATABASE_URL and sign cookies with BETTER_AUTH_SECRET, so both must
// match the running app.
loadEnv({ path: resolve(__dirname, ".env"), quiet: true });
if (existsSync(resolve(__dirname, ".env.local"))) {
  loadEnv({ path: resolve(__dirname, ".env.local"), override: true, quiet: true });
}
// Optional, git-ignored: points the tests (and the dev server they start) at a
// local database when .env.local points at a hosted one. It usually also sets
// BETTER_AUTH_URL to another port and NEXT_DIST_DIR, so that server runs beside
// your own `pnpm dev` without sharing its port or .next cache.
if (existsSync(resolve(__dirname, ".env.e2e"))) {
  loadEnv({ path: resolve(__dirname, ".env.e2e"), override: true, quiet: true });
}

// The e2e helpers create and delete users, folders and links. Refuse to run
// against anything but a local database (e.g. a production URL left in
// .env.local).
const databaseHost = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).hostname
  : "";
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error(
    `E2E tests only run against a local database; DATABASE_URL points at "${databaseHost || "nothing"}".`,
  );
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The PWA service worker is off in dev; block it anyway so a cached
    // worker from `pnpm start` can't serve stale pages to the tests.
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Installed-PWA users are mostly on iOS, so cover Safari's engine too.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // The server inherits this process's env (.env.e2e included), which wins
    // over the .env files Next loads itself.
    command: `pnpm dev --port ${new URL(baseURL).port || "3000"}`,
    url: baseURL,
    // Reuse a `pnpm dev` you already have running.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
