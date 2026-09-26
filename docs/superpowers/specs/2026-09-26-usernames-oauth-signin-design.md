# Usernames + OAuth-only sign-in — Design

**Date:** 2026-09-26
**Status:** Approved in brainstorming, pending spec review
**Branch:** `feat/oauth-usernames`

## Goal

1. Give every Purl account a unique, editable **username** (`@nublson`). It is the prerequisite for the paused **Strands** feature, whose pages will live at `/@username/slug`.
2. Replace email/password sign-in with **Google and GitHub** sign-in (Apple designed in, shipped later), started directly from the landing page.

## Decisions

| Topic | Decision |
|---|---|
| Providers | Google + GitHub now. Apple is configured in code but enabled only when its env vars exist (needs a paid Apple Developer account). |
| Email/password | Removed entirely: no `/login`, `/signup`, `/verify-email`, no verification emails. |
| Sign-in entry point | Landing page `/` hero buttons. `/login` and `/signup` redirect to `/`. |
| Signed-in user on `/` | Redirected to `/home`. |
| Existing password accounts | Auto-linked by email on first Google/GitHub sign-in (even if never verified). Accounts with no matching provider email lose access; accepted. |
| Username source | Auto-generated at account creation (email local part → name → `user`, numeric suffix on collision); editable in Settings → Account. |
| Username implementation | Own `additionalFields.username` (`input: false`) + create hook + own API routes. **Not** Better Auth's `username` plugin (password-oriented, adds unused `/sign-in/username` and `displayUsername`). |
| Provider management | Settings → Account lists providers with Connect / Disconnect; the last provider cannot be disconnected. |

## Out of scope

- Strands (paused; its decisions are recorded separately).
- Apple sign-in going live (only the code path + env gating).
- Username change history / redirects for old usernames (nothing public uses usernames yet; revisit when Strands sharing ships).
- Removing the v1 API or MCP.

## 1. Data model

```prisma
model User {
  // ...existing fields
  username String @unique // lowercase, 3–30 chars, [a-z0-9_-]
}
```

Migration is split across two releases (see Rollout):

1. `add_username`: add `username TEXT NULL` + unique index; backfill every row.
2. `username_not_null`: `ALTER COLUMN username SET NOT NULL`.

`Account` and `Session` schemas are unchanged. `Account.password` stays in the schema (Better Auth's model) but no rows will use it.

## 2. Usernames — `src/lib/usernames.ts`

- `USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/` (3–30 chars, starts with a letter or digit).
- `RESERVED_USERNAMES`: small set, e.g. `admin`, `api`, `app`, `auth`, `help`, `home`, `purl`, `root`, `settings`, `support`, `u`, `www`. (Strands URLs are `/@username/...`, so no route collisions exist; the list only prevents impersonation-like names.)
- `normalizeUsername(input)`: trim, lowercase.
- `validateUsername(input)`: returns `{ ok: true, username }` or `{ ok: false, reason: "format" | "reserved" }`.
- `usernameBaseFrom(email, name)`: pure. Takes the email local part, drops a `+tag`, strips accents, lowercases, replaces invalid characters, collapses and trims `-`/`_`, and truncates to 26 characters (leaving room for a suffix). If the result is under 3 characters, it tries the same on `name`, then falls back to `user`. A reserved result gets `-1`.
- `generateUsername(email, name, isTaken)`: base, then `base2`, `base3`, … until `isTaken` is false. For bases too short to hold a suffix, or after 50 tries, it uses `base-<4 random [a-z0-9]>`.
- `planUsernames(users)`: pure. Assigns unique usernames to a batch, used by the backfill script, and handles collisions within the batch as well as against existing names.

## 3. Auth configuration — `src/lib/auth.ts`

- **Remove** `emailAndPassword` and `emailVerification` (and the `getResend` import; `src/lib/resend.ts` stays for feedback emails).
- **`socialProviders: getSocialProviders(process.env)`**, extracted to `src/lib/auth-providers.ts`:
  - `google`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  - `github`: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
  - `apple`: included only when `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` are all set. The client secret JWT (ES256, 180 days) is generated at runtime with `jose`, as in the Better Auth docs; `https://appleid.apple.com` is added to `trustedOrigins` only then.
  - Throws a descriptive error in production if Google or GitHub credentials are missing.
  - `getEnabledProviders()` is exported for the UI (which buttons and Settings rows to show).
- **Account linking:**
  ```ts
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github", "apple"],
      requireLocalEmailVerified: false, // legacy unverified password users must still link
      allowDifferentEmails: true,        // explicit "Connect" in Settings only
    },
  },
  ```
  Rationale for `requireLocalEmailVerified: false`: with password sign-up gone, nobody can create new unverified-email accounts. At worst, a verified provider email owner gains an account someone else created with their email earlier. `allowDifferentEmails` applies only to `linkSocial` from an authenticated session; implicit sign-in linking still matches by email.
- **Username field:** `user.additionalFields.username = { type: "string", required: true, input: false }`. `input: false` means clients cannot set it through `updateUser` or sign-up; only our route can change it.
- **Create hook:** `databaseHooks.user.create.before` calls `assignUsernameOnCreate(user)` (exported, testable), which returns `{ data: { ...user, username } }` using `generateUsername` with a Prisma `isTaken` lookup.
- **`mcp` plugin:** `loginPage` and `oidcConfig.loginPage` change to `/`.

## 4. Username API

`src/app/api/user/username/route.ts`
- `PATCH { username }` requires a session (`401` otherwise).
- Runs `validateUsername`: `400 { code: "INVALID_FORMAT" | "RESERVED" }`.
- If the name is taken by another user: `409 { code: "TAKEN" }`, including a Prisma `P2002` race on update.
- Unchanged value: `200` no-op. Success: `200 { username }`.

`src/app/api/user/username/available/route.ts`
- `GET ?u=` requires a session.
- Returns `{ available: boolean, reason?: "format" | "reserved" | "taken" }`. The user's own current username counts as available.

## 5. Routing — `src/proxy.ts` and `next.config.ts`

- `publicRoutes`: `/` becomes `whenAuthenticated: "redirect"` (signed-in → `/home`). `/login` and `/signup` entries are removed. `/.well-known` and `/api/auth` are unchanged.
  - **Exception:** a signed-in request to `/` that carries MCP authorize params is not expected, since the plugin only sends unauthenticated users to `loginPage`. No special case is added; the plan must confirm this assumption.
- `REDIRECT_WHEN_NOT_AUTHENTICATED = "/"`.
- Remove `VERIFY_EMAIL_PATH`, `REDIRECT_WHEN_NOT_VERIFIED`, and the three verification branches.
- `next.config.ts` `redirects()` adds `/login`, `/signup`, and `/verify-email` → `/` (permanent).
- `sitemap.ts`: remove the `/signup` entry.

## 6. UI

### Landing hero — `src/sections/hero.tsx`
- Replace "Get started" / "Log in" with `ProviderButtons`: "Continue with Google" (primary) and "Continue with GitHub" (outline), plus "Continue with Apple" when enabled. Icons are inline SVGs in `src/components/provider-icons.tsx`.
- Click calls `signIn.social({ provider, callbackURL, errorCallbackURL: "/" })`. The clicked button shows a spinner and all buttons are disabled until navigation.
- `callbackURL = buildSignInCallbackURL(currentSearchParams)` in `src/lib/sign-in-callback.ts` (pure):
  - Without MCP/OIDC authorize params, it returns `/home`.
  - With them, it returns the URL that resumes the MCP authorization. **The exact resume URL must be confirmed against the installed `mcp` plugin during planning.**
- `SignInErrorToast` (client): reads `?error=`, maps known codes (`account_not_linked`, `access_denied`, fallback) to a friendly toast, then removes the param with `router.replace`.

### Settings → Account — `src/components/settings-account.tsx`
- **Username row:** shows `@username`, with an **Edit** button that opens `DialogEditUsername` (built on `DialogWrapper`).
  - The input shows client-side `validateUsername` feedback immediately, and a debounced (300 ms) availability check against `/available`.
  - Messages: "Use 3–30 lowercase letters, numbers, - or _", "That username is reserved", "That username is taken".
  - Save sends the `PATCH`, then refreshes the session (`useSession().refetch()` or equivalent) and shows the toast "Username updated".
- **Email row:** unchanged value; description "From your sign-in provider".
- **Sign-in methods** (`SettingsSignInMethods`): one row per enabled provider.
  - Data comes from `listAccounts()`.
  - **Connect:** `linkSocial({ provider, callbackURL })`, returning to the app with the Settings dialog on Account (use the existing way of opening Settings, or add a `?settings=account` param if none exists; confirm in planning).
  - **Disconnect:** `unlinkAccount({ providerId })`. It is disabled with a tooltip ("You need at least one way to sign in") when it's the only connected provider.
- `src/lib/auth-client.ts`: export `linkSocial`, `unlinkAccount`, and `listAccounts`; remove `signUp` and `sendVerificationEmail`.
- `src/hooks/use-auth.ts`: replace `signInWithEmail` / `signUpWithEmail` with `signInWithProvider(provider)`; keep `signOut`, which now pushes to `/`.

### Removed
- `src/app/(public)/login/`, `signup/`, `verify-email/`, and any components used only by them.
- Update the `(public)/layout.tsx` comment.

## 7. One-off data migration — `scripts/migrate-oauth-only.ts`

Run with `pnpm tsx scripts/migrate-oauth-only.ts --step=<name> [--dry-run]`:

- `--step=backfill-usernames` (release 1): loads users with `username IS NULL`, runs `planUsernames` against existing usernames, and updates in batches.
- `--step=cleanup` (release 2, at deploy): in one transaction,
  - `DELETE FROM accounts WHERE "providerId" = 'credential'`
  - `DELETE FROM sessions WHERE "userId" IN (SELECT id FROM users WHERE "emailVerified" = false)`

  It prints counts; `--dry-run` prints counts without writing.

Why delete credential rows: they are unusable without password sign-in, and Better Auth counts them as linked accounts. Left in place, they would let a user disconnect every social provider and be locked out.

## 8. Testing

Unit tests (Vitest, node):
- `src/lib/usernames.test.ts`: normalize, validate (length, charset, leading character, reserved), `usernameBaseFrom` (`Nubel.Son+news@x.com` → `nubelson`, accents, short prefix → name → `user`), `generateUsername` collisions, `planUsernames` in-batch collisions.
- `src/lib/auth-providers.test.ts`: Apple only when all four env vars are set; the production error when Google or GitHub are missing.
- `assignUsernameOnCreate` test: sets `username`, respects collisions.
- `src/lib/sign-in-callback.test.ts`: `/home` by default; the MCP resume URL when authorize params are present; ignores unrelated params.
- `src/app/api/user/username/route.test.ts` and `available/route.test.ts`: 401 / 400 / 409 (including P2002) / 200 paths.
- `src/proxy.test.ts`: signed-out private → `/`; signed-in `/` → `/home`; signed-out `/` → next; verification tests removed.

Manual checks (localhost, real OAuth apps):
1. A new Google sign-in creates a user with a generated username.
2. A seeded legacy **verified** password user signs in with a same-email Google account and sees their links.
3. The same as 2 for a legacy **unverified** user.
4. Settings: connect GitHub with a different email, disconnect Google, and confirm the last provider cannot be disconnected.
5. Username edit: format, reserved, and taken errors; the success value updates across the UI.
6. MCP: connect a client while signed out, sign in on `/`, see the consent screen, and confirm the client is authorized.
7. `/login`, `/signup`, and `/verify-email` redirect to `/`; signed-in `/` redirects to `/home`.

## 9. Rollout

1. **Release 1:** the `add_username` migration and `backfill-usernames`. This is additive and safe with the current auth code. Rehearse on a Supabase branch database first.
2. **Setup (manual):** create Google and GitHub OAuth apps with callbacks `https://<domain>/api/auth/callback/google` and `/github`, plus localhost equivalents. Set the env vars in Vercel and `.env.example`.
3. **Release 2:** the `username_not_null` migration plus the new auth code and UI. Run `--step=cleanup` as part of the deploy (dry-run first). Deleting credential rows is irreversible, so take a database backup before it.
4. **Optional:** a one-time email to existing users: "Purl now uses Google/GitHub sign-in; use the same email you signed up with."

## Open items to confirm during planning

- The exact MCP authorize resume URL for `callbackURL` with the installed `mcp` plugin (§6).
- How the Settings dialog is opened today, to pick the `linkSocial` return URL (§6).
- The session refresh method after a username change with `cookieCache` enabled (5 min): ensure the new username is not served stale.
