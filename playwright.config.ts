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
    command: "pnpm dev",
    url: baseURL,
    // Reuse a `pnpm dev` you already have running.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
