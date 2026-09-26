-- Add usernames for all existing users, then switch to OAuth-only sign-in.
-- IRREVERSIBLE: this deletes credential (password) accounts and sessions for
-- unverified users. It must be applied at deploy time, immediately before
-- promoting the OAuth-only deployment (see docs/superpowers/specs/
-- 2026-09-26-usernames-oauth-signin-design.md, section 9 "Rollout"). Take a
-- database backup first and rehearse against a branch/copy of the database.
-- Wrapped in a single transaction so a residual collision on the unique index
-- (or any other failure) rolls every step back.

BEGIN;

-- 1. Add the column as nullable so existing rows can be backfilled below.
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- 2. Compute a base username per user from the email local part, then number
--    duplicates within the same base (first keeps the base, others get a
--    numeric suffix).
WITH base_calc AS (
  SELECT
    id,
    "createdAt",
    left(
      regexp_replace(
        regexp_replace(lower(split_part(split_part(email, '@', 1), '+', 1)), '[^a-z0-9_-]', '', 'g'),
        '^[-_]+',
        ''
      ),
      26
    ) AS raw_base
  FROM "users"
),
based AS (
  SELECT
    id,
    "createdAt",
    CASE
      WHEN length(raw_base) < 3 THEN 'user'
      WHEN raw_base IN ('admin', 'api', 'app', 'auth', 'help', 'home', 'purl', 'root', 'settings', 'support', 'www')
        THEN raw_base || '-1'
      ELSE raw_base
    END AS base
  FROM base_calc
),
numbered AS (
  SELECT
    id,
    base,
    row_number() OVER (PARTITION BY base ORDER BY "createdAt", id) AS rn
  FROM based
)
UPDATE "users" u
SET username = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || n.rn END
FROM numbered n
WHERE u.id = n.id;

-- 3. Different base groups can still land on the same computed username
--    (e.g. "nubelson2" derived independently and "nubelson" + numbering).
--    Disambiguate any leftover duplicates with a suffix from the user id.
--    Truncated to 25 chars so the result stays within the 30-char limit.
WITH dupes AS (
  SELECT
    id,
    username,
    row_number() OVER (PARTITION BY username ORDER BY "createdAt", id) AS rn
  FROM "users"
)
UPDATE "users" u
SET username = left(d.username, 25) || '-' || lower(left(u.id, 4))
FROM dupes d
WHERE u.id = d.id AND d.rn > 1;

-- 4. Enforce the constraint going forward.
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- 5. Password sign-in is removed: credential accounts are unusable without
--    it, and Better Auth counts them as a linked provider, which would let a
--    user disconnect every OAuth provider and be locked out.
DELETE FROM "accounts" WHERE "providerId" = 'credential';

-- 6. Unverified legacy accounts never completed email verification and have
--    no OAuth provider linked yet; drop their sessions so they must sign in
--    again (and get linked) via Google/GitHub.
DELETE FROM "sessions" WHERE "userId" IN (SELECT id FROM "users" WHERE "emailVerified" = false);

COMMIT;
