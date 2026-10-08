import { describe, expect, it } from "vitest";
// The Vercel build step (plain Node, run before `next build`).
import { shouldMigratePreviewDb } from "../../scripts/migrate-preview-db.mjs";

describe("shouldMigratePreviewDb", () => {
  it("migrates the develop branch's Preview build (dev.purl.live)", () => {
    expect(
      shouldMigratePreviewDb({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop" }),
    ).toBe(true);
  });

  it.each([
    ["production (the release workflow migrates it)", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }],
    ["a PR's preview (its migrations land with the merge)", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x", VERCEL_GIT_PULL_REQUEST_ID: "12" }],
    ["develop with a PR id (a PR from develop)", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", VERCEL_GIT_PULL_REQUEST_ID: "3" }],
    ["a local or CI build", {}],
  ])("skips %s", (_label, env) => {
    expect(shouldMigratePreviewDb(env)).toBe(false);
  });
});
