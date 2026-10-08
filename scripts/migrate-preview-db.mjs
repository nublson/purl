#!/usr/bin/env node
/**
 * Vercel build step, before `next build` (package.json "build").
 *
 * dev.purl.live is the Preview deployment of `develop`, on its own database
 * (the `purl-dev` Supabase project; Preview's DATABASE_URL). Nothing else
 * migrates it, so a `develop` build applies pending migrations first: the
 * code it ships never meets an older schema. Then it turns on row-level
 * security for every table in `public` (no policies), so Supabase's public
 * API (anon key) can't read them; Prisma connects as the tables' owner and
 * isn't affected.
 *
 * Everything else is skipped: production is migrated by the release
 * workflow (.github/workflows/release.yml) before it ships, and PR previews
 * share dev's database without migrating it (a PR's migrations land with
 * its merge to develop).
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Whether this build should migrate dev's database. */
export function shouldMigratePreviewDb(env) {
  return (
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "develop" &&
    !env.VERCEL_GIT_PULL_REQUEST_ID
  );
}

/**
 * Migrations need a session or direct connection: Prisma takes an advisory
 * lock, which the transaction pooler (port 6543, `pgbouncer=true`) can't
 * hold. Fails fast with the fix instead of a hung or confusing build. The
 * URL is never printed (it carries the password).
 */
export function assertMigratableUrl(url) {
  if (!url) {
    throw new Error("[migrate-preview-db] DATABASE_URL is not set for Preview.");
  }
  const parsed = new URL(url);
  if (parsed.port === "6543" || parsed.searchParams.get("pgbouncer") === "true") {
    throw new Error(
      "[migrate-preview-db] Preview's DATABASE_URL is the transaction pooler; " +
        "use purl-dev's session pooler (port 5432) or a direct connection.",
    );
  }
}

/**
 * Idempotent: enables RLS on every table and partitioned table in `public`
 * that doesn't have it, `_prisma_migrations` included (harmless: Prisma owns
 * it and bypasses RLS).
 */
const ENABLE_RLS_SQL = `
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
`;

function main() {
  if (!shouldMigratePreviewDb(process.env)) {
    console.log("[migrate-preview-db] not a develop Preview build; skipping.");
    return;
  }
  assertMigratableUrl(process.env.DATABASE_URL);
  console.log("[migrate-preview-db] develop Preview build: migrating dev's database.");
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "inherit" });
  execFileSync("pnpm", ["exec", "prisma", "db", "execute", "--stdin"], {
    input: ENABLE_RLS_SQL,
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log("[migrate-preview-db] done; RLS on for every public table.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
