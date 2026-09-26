# Usernames + OAuth-only Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every account gets a unique, editable username, and sign-in moves from email/password to Google + GitHub (Apple env-gated), started from the landing page.

**Architecture:** Username rules live in a pure module (`src/lib/usernames.ts`) used by a Better Auth create hook, our own username API routes, and the Settings UI. `src/lib/auth.ts` drops email/password and gains social providers, account linking, and an `input: false` username field. One hand-applied Prisma migration fills usernames in SQL and removes password accounts. The routing is simplified: `/` is the only signed-out page.

**Tech Stack:** Next.js App Router, Better Auth 1.6.x (`socialProviders`, `accountLinking`, `databaseHooks`, `mcp` plugin), Prisma/Postgres, Vitest (node), shadcn/Radix UI, sonner.

**Spec:** `docs/superpowers/specs/2026-09-26-usernames-oauth-signin-design.md`

## Global Constraints

- Username format: `/^[a-z0-9][a-z0-9_-]{2,29}$/` (3–30 chars, lowercase, starts with a letter or digit).
- Reserved usernames: `admin`, `api`, `app`, `auth`, `help`, `home`, `purl`, `root`, `settings`, `support`, `www`.
- Username base truncates to 26 characters; collision suffixes are `base2`, `base3`, …; fallback base is `user`; a reserved base gets `-1`.
- Username field in Better Auth is `input: false`; only `PATCH /api/user/username` changes it.
- `accountLinking`: `enabled: true`, `trustedProviders: ["google", "github", "apple"]`, `requireLocalEmailVerified: false`, `allowDifferentEmails: true`.
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`; Apple (all four, optional): `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`.
- Sign-in `callbackURL` is always `/home`; `errorCallbackURL` is `/`. The MCP resume is handled by the plugin; don't build a resume URL.
- `mcp` plugin `loginPage` and `oidcConfig.loginPage` are `/`.
- `src/lib/resend.ts` stays (feedback emails use it).
- ESLint: named imports only from `lucide-react` / `@radix-ui/*`.
- Copy, verbatim: "Continue with Google", "Continue with GitHub", "Continue with Apple", "Use 3–30 lowercase letters, numbers, - or _", "That username is reserved", "That username is taken", "Username updated", "From your sign-in provider", "You need at least one way to sign in", "For your security, sign in again to delete your account."

## Review Focus

1. **An email whose local part has no usable ASCII** (`日本@x.com`, `..@x.com`): expect the name to be used, then `user`, never an empty or invalid username. Pinned in Task 1.
2. **Re-saving your own username with different case or spacing** (`" NubLson "` when yours is `nublson`): expect a `200` no-op, not `409 TAKEN`. Pinned in Task 4.
3. **An unknown or missing `?error=` code after an OAuth failure:** expect the generic toast, never a raw code or a crash. Pinned in Task 6.
4. **A legacy unverified password user signing in with Google:** expect linking into the existing account, which depends on `requireLocalEmailVerified: false`. Pinned in Task 3 (config test) and manual check 3.
5. **A signed-out MCP client authorization:** expect the landing page, then the provider, then the consent screen, not `/home`. It depends on `loginPage: "/"` and the plugin cookie. Pinned in Task 3 (config test) and manual check 6.

---

### Task 1: Username rules

**Files:**
- Create: `src/lib/usernames.ts`
- Test: `src/lib/usernames.test.ts`

**Interfaces:**
- Produces:
  - `USERNAME_PATTERN: RegExp`, `RESERVED_USERNAMES: ReadonlySet<string>`
  - `normalizeUsername(input: string): string`
  - `type UsernameCheck = { ok: true; username: string } | { ok: false; reason: "format" | "reserved" }`
  - `validateUsername(input: string): UsernameCheck` (normalizes first)
  - `usernameBaseFrom(email: string, name: string | null | undefined): string`
  - `generateUsername(email: string, name: string | null | undefined, isTaken: (u: string) => Promise<boolean>): Promise<string>`

- [ ] **Step 1: Write the failing tests**

```ts
describe("validateUsername", () => {
  it("normalizes then accepts", () => expect(validateUsername("  NubLson ")).toEqual({ ok: true, username: "nublson" }));
  it.each(["ab", "a".repeat(31), "-abc", "_abc", "ab c", "abç"])("rejects %s as format", (u) =>
    expect(validateUsername(u)).toEqual({ ok: false, reason: "format" }));
  it("rejects reserved", () => expect(validateUsername("Admin")).toEqual({ ok: false, reason: "reserved" }));
  it("accepts 30 chars with - and _", () => expect(validateUsername("a_b-" + "c".repeat(26)).ok).toBe(true));
});

describe("usernameBaseFrom", () => {
  it("uses the email local part without +tag", () => expect(usernameBaseFrom("Nubel.Son+news@x.com", "N")).toBe("nubelson"));
  it("strips accents", () => expect(usernameBaseFrom("josé@x.com", null)).toBe("jose"));
  it("trims leading -/_ and collapses repeats", () => expect(usernameBaseFrom("__a--b__c@x.com", null)).toBe("a-b_c"));
  it("truncates to 26", () => expect(usernameBaseFrom("a".repeat(40) + "@x.com", null)).toHaveLength(26));
  it("falls back to name", () => expect(usernameBaseFrom("日本@x.com", "Ana Lima")).toBe("ana-lima"));
  it("falls back to user", () => expect(usernameBaseFrom("..@x.com", "李")).toBe("user"));
  it("suffixes reserved", () => expect(usernameBaseFrom("admin@x.com", null)).toBe("admin-1"));
});

describe("generateUsername", () => {
  it("returns the base when free", async () =>
    expect(await generateUsername("nubelson@x.com", null, async () => false)).toBe("nubelson"));
  it("counts up on collision", async () => {
    const taken = new Set(["nubelson", "nubelson2"]);
    expect(await generateUsername("nubelson@x.com", null, async (u) => taken.has(u))).toBe("nubelson3");
  });
  it("falls back to a random suffix after 50 tries", async () => {
    const u = await generateUsername("nubelson@x.com", null, async (c) => !/^nubelson-[a-z0-9]{4}$/.test(c));
    expect(u).toMatch(/^nubelson-[a-z0-9]{4}$/);
  });
  it("always returns a valid username", async () =>
    expect(validateUsername(await generateUsername("日本@x.com", "", async () => false)).ok).toBe(true));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/usernames.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/usernames.ts`**

- Slug a candidate with: `.normalize("NFKD").replace(/[̀-ͯ]/g, "")`, lowercase, spaces and `.` removed for emails (`Nubel.Son` → `nubelson`) but spaces → `-` for names (`Ana Lima` → `ana-lima`), then drop everything outside `[a-z0-9_-]`, collapse runs of `-`/`_` to their first character, trim leading/trailing `-`/`_`, and `slice(0, 26)`.
- A candidate of 3+ characters is used; otherwise try the name, then `user`.
- `generateUsername` tries `base`, then `base2`…`base50`, then `base-<4 random [a-z0-9]>` until free.
- This module must not import Prisma, so it stays safe for client components.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/usernames.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usernames.ts src/lib/usernames.test.ts
git commit -m "feat: add username rules and generation"
```

---

### Task 2: Schema and data migration

**Files:**
- Modify: `prisma/schema.prisma` (`User` model)
- Create: `prisma/migrations/<timestamp>_oauth_only_usernames/migration.sql`

**Interfaces:**
- Produces: `User.username: string` (required, unique) in the generated Prisma client.

- [ ] **Step 1: Add `username String @unique` to `User`**, then run `pnpm prisma migrate dev --create-only --name oauth_only_usernames`.

- [ ] **Step 2: Replace the generated SQL with the spec §7 migration**, as one file in this order:
  1. Add the column as nullable.
  2. Fill `username` using a CTE:
     - `base = left(regexp_replace(regexp_replace(lower(split_part(split_part(email,'@',1),'+',1)), '[^a-z0-9_-]', '', 'g'), '^[-_]+', ''), 26)`
     - `CASE` when `length(base) < 3` then `'user'`; when base is in the reserved list (Global Constraints) then `base || '-1'`.
     - Number duplicates with `row_number() OVER (PARTITION BY base ORDER BY "createdAt", id)`: 1 → `base`, n → `base || n`.
  3. A second `UPDATE` for any value still duplicated: `username || '-' || left(id, 4)`.
  4. `SET NOT NULL`, then `CREATE UNIQUE INDEX "users_username_key" ON "users"("username")`.
  5. `DELETE FROM "accounts" WHERE "providerId" = 'credential';`
  6. `DELETE FROM "sessions" WHERE "userId" IN (SELECT id FROM "users" WHERE "emailVerified" = false);`

  Start the file with a header comment saying it is irreversible and must be applied at deploy time (spec §9).

- [ ] **Step 3: Verify against a local database with tricky data.** Before applying, insert users with the emails `a+x@x.com`, `A@y.com`, `nubelson@x.com`, `Nubelson@y.com`, `admin@x.com`, `日本@x.com`, `-_-@x.com` (plus one credential account and one unverified user with a session). Then run `pnpm prisma migrate dev`.

  Run: `psql "$DATABASE_URL" -c "select email, username from users order by email; select count(*) from accounts where \"providerId\"='credential';"`
  Expected: every username matches `USERNAME_PATTERN` and is unique (`nubelson`, `nubelson2`, `admin-1`, and `user`/`user2`/`user3` for the short or non-ASCII ones); the credential count is 0; the unverified user's session is gone.

- [ ] **Step 4: Run `pnpm prisma generate && pnpm typecheck`.** Expect failures only where later tasks change code (e.g. user creation types). Record them; don't fix them here.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add usernames and remove password accounts in one migration"
```

---

### Task 3: Auth configuration

**Files:**
- Create: `src/lib/auth-providers.ts`, `src/lib/auth-providers.test.ts`
- Create: `src/lib/auth-hooks.ts`, `src/lib/auth-hooks.test.ts`
- Modify: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `.env.example`
- Add dependency: `jose` (only if not already installed; check with `pnpm why jose`)

**Interfaces:**
- Consumes: `generateUsername` (Task 1); `User.username` (Task 2).
- Produces:
  - `type ProviderId = "google" | "github" | "apple"`
  - `getSocialProviders(env: NodeJS.ProcessEnv): BetterAuthOptions["socialProviders"]`
  - `getEnabledProviders(env?: NodeJS.ProcessEnv): ProviderId[]`, server-only, used by Tasks 6–7
  - `ACCOUNT_LINKING` (the object from Global Constraints), `AUTH_LOGIN_PAGE = "/"`
  - `assignUsernameOnCreate<U extends { email: string; name?: string | null }>(user: U): Promise<{ data: U & { username: string } }>`
  - `SessionUser` gains `username: string`
  - `auth-client.ts` exports `signIn`, `signOut`, `useSession`, `getSession`, `deleteUser`, `updateUser`, `linkSocial`, `unlinkAccount`, `listAccounts`; `signUp` and `sendVerificationEmail` are removed.

- [ ] **Step 1: Write the failing tests**

```ts
// auth-providers.test.ts
const base = { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs", GITHUB_CLIENT_ID: "h", GITHUB_CLIENT_SECRET: "hs" };
it("enables google and github", () => expect(getEnabledProviders(base)).toEqual(["google", "github"]));
it("enables apple only with all four vars", () => {
  expect(getEnabledProviders({ ...base, APPLE_CLIENT_ID: "a", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k" })).not.toContain("apple");
  expect(getEnabledProviders({ ...base, APPLE_CLIENT_ID: "a", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY: "p" })).toContain("apple");
});
it("throws in production when github is missing", () =>
  expect(() => getSocialProviders({ ...base, GITHUB_CLIENT_ID: undefined, NODE_ENV: "production" })).toThrow(/GITHUB_CLIENT_ID/));
it("links legacy unverified accounts", () => expect(ACCOUNT_LINKING).toMatchObject({
  enabled: true, requireLocalEmailVerified: false, allowDifferentEmails: true,
  trustedProviders: ["google", "github", "apple"] }));
it("sends MCP sign-in to the landing page", () => expect(AUTH_LOGIN_PAGE).toBe("/"));

// auth-hooks.test.ts (mock @/lib/prisma: user.findUnique)
it("assigns a generated username", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  expect((await assignUsernameOnCreate({ email: "nubelson@x.com", name: "N" })).data.username).toBe("nubelson");
});
it("skips taken usernames", async () => {
  vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { username: string } }) =>
    where.username === "nubelson" ? { id: "u1" } : null) as never);
  expect((await assignUsernameOnCreate({ email: "nubelson@x.com", name: "N" })).data.username).toBe("nubelson2");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/auth-providers.test.ts src/lib/auth-hooks.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `auth-providers.ts` and `auth-hooks.ts`**

- Apple's `clientSecret` is generated with `jose` `SignJWT` (ES256, `kid` = key id, `iss` = team id, `sub` = client id, `aud` = `https://appleid.apple.com`, expiry 180 days), as in the Better Auth Apple docs, via the async provider factory.
- Outside production, missing Google/GitHub vars skip that provider instead of throwing.
- Export `APPLE_TRUSTED_ORIGIN = "https://appleid.apple.com"` for `auth.ts`.

- [ ] **Step 4: Wire up `auth.ts`**

- Remove `emailAndPassword`, `emailVerification`, and the `getResend` import.
- Add `socialProviders: getSocialProviders(process.env)`, `account: { accountLinking: ACCOUNT_LINKING }`, and `trustedOrigins` containing `APPLE_TRUSTED_ORIGIN` only when Apple is enabled.
- Add `user.additionalFields.username: { type: "string", required: true, input: false }` (keep `deleteUser.enabled`).
- Add `databaseHooks: { user: { create: { before: assignUsernameOnCreate } } }`.
- Set both `mcp` `loginPage` values to `AUTH_LOGIN_PAGE`.
- Update the `auth-client.ts` exports per Interfaces, and `getSessionUser` to return `username`.
- Add the env vars to `.env.example` with the callback URL in a comment, and remove the verification-only Resend comment if there is one.

- [ ] **Step 5: Run `pnpm vitest run src/lib && pnpm typecheck`.** Expected: the lib tests pass. Type errors remain only in files later tasks rewrite (`use-auth.ts`, login/signup/verify-email pages, `delete-account-item.tsx`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts src/lib/auth-providers.ts src/lib/auth-providers.test.ts src/lib/auth-hooks.ts src/lib/auth-hooks.test.ts src/lib/session.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: switch Better Auth to Google and GitHub sign-in with usernames"
```

---

### Task 4: Username API

**Files:**
- Create: `src/app/api/user/username/route.ts` (+ `route.test.ts`)
- Create: `src/app/api/user/username/available/route.ts` (+ `route.test.ts`)
- Create: `src/lib/username-store.ts`

**Interfaces:**
- Consumes: `validateUsername` (Task 1); `getBrowserSessionUserId()` from `src/lib/require-browser-session.ts`.
- Produces:
  - `isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean>` and `setUsername(userId: string, username: string): Promise<"ok" | "taken">`, which catches Prisma `P2002`.
  - `PATCH /api/user/username` with body `{ username }` → `200 { username }` | `400 { code: "INVALID_FORMAT" | "RESERVED" }` | `409 { code: "TAKEN" }` | `401`.
  - `GET /api/user/username/available?u=` → `200 { available: boolean, reason?: "format" | "reserved" | "taken" }` | `401`.

- [ ] **Step 1: Write the failing route tests.** Mock `@/lib/require-browser-session` and `@/lib/prisma` (`user.findUnique`, `user.update`), as `connected-apps/route.test.ts` does.
  - `PATCH`: 401 without a session; 400 `INVALID_FORMAT` for `"a b"`; 400 `RESERVED` for `"admin"`; 409 when another user owns it; 409 when `update` rejects with a `P2002` error; 200 `{ username: "nublson" }` for `" NubLson "`; **200 without calling `update` when the normalized value equals the user's current username** (Review Focus 2); 400 for a body that isn't JSON.
  - `GET /available`: 401 without a session; `{ available: false, reason: "format" }` for `"a"`; `reason: "reserved"` for `"admin"`; `reason: "taken"`; `{ available: true }` for your own current username.

- [ ] **Step 2: Run `pnpm vitest run src/app/api/user/username`.** Expected: FAIL.

- [ ] **Step 3: Implement `username-store.ts` and both routes.**

- [ ] **Step 4: Run `pnpm vitest run src/app/api/user/username`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/username-store.ts src/app/api/user/username
git commit -m "feat: add username update and availability endpoints"
```

---

### Task 5: Routing: landing as the only signed-out page

**Files:**
- Modify: `src/proxy.ts`, `src/proxy.test.ts`, `next.config.ts`, `src/app/sitemap.ts`, `src/app/(public)/layout.tsx` (comment)
- Delete: `src/app/(public)/login/`, `src/app/(public)/signup/`, `src/app/(public)/verify-email/`

- [ ] **Step 1: Rewrite the proxy tests first.** Delete every `/verify-email` and `emailVerified: false` case, and remove `emailVerified` from mocked sessions. Add:
  - a signed-out request to `/home` redirects to a URL ending in `/` (pathname `/`)
  - a signed-in request to `/` redirects to `/home`
  - a signed-out request to `/` returns next
  - a signed-out request to `/?client_id=x&response_type=code` returns next (the MCP login landing)
  - `/api/auth/callback/google` returns next

  Keep the existing rate-limit, API/MCP bypass, and `.well-known` tests.

- [ ] **Step 2: Run `pnpm vitest run src/proxy.test.ts`.** Expected: the new cases FAIL.

- [ ] **Step 3: Update `proxy.ts`**

- `/` becomes `whenAuthenticated: "redirect"`; remove the `/login` and `/signup` entries.
- `REDIRECT_WHEN_NOT_AUTHENTICATED = "/"`; delete the verification constants and branches.
- Update the comment that mentions `/login`.
- In `next.config.ts` `redirects()`, add permanent redirects from `/login`, `/signup`, and `/verify-email` to `/`.
- Remove the `/login` and `/signup` entries from `sitemap.ts`.
- Delete the three page directories.

- [ ] **Step 4: Run `pnpm vitest run src/proxy.test.ts && pnpm lint`.** Expected: PASS, with no imports of the deleted pages remaining (`grep -rn "verify-email\|/signup\|/login" src` matches only `next.config.ts` and `src/sections/hero.tsx`, which Task 6 rewrites).

- [ ] **Step 5: Commit**

```bash
git add -A src/proxy.ts src/proxy.test.ts next.config.ts src/app/sitemap.ts "src/app/(public)"
git commit -m "feat: make the landing page the only sign-in entry point"
```

---

### Task 6: Landing sign-in buttons

**Files:**
- Create: `src/components/provider-icons.tsx`, `src/components/provider-buttons.tsx`, `src/components/sign-in-error-toast.tsx`, `src/lib/sign-in-errors.ts` (+ `.test.ts`)
- Modify: `src/sections/hero.tsx`, `src/app/(public)/page.tsx`, `src/hooks/use-auth.ts`

**Interfaces:**
- Consumes: `getEnabledProviders()` and `ProviderId` (Task 3); `signIn`, `signOut` from `auth-client`.
- Produces:
  - `signInErrorMessage(code: string | null): string | null`
  - `<ProviderButtons providers={ProviderId[]} />`
  - `useAuth()` returns `{ signInWithProvider(provider: ProviderId): Promise<void>, signOut(): Promise<void> }`; `signOut` pushes to `/`.
  - `<ProviderIcon provider={ProviderId} />`, reused by Task 7.

- [ ] **Step 1: Write the failing test (Review Focus 3)**

```ts
it("maps account_not_linked", () => expect(signInErrorMessage("account_not_linked")).toMatch(/already linked|same email/i));
it("maps access_denied", () => expect(signInErrorMessage("access_denied")).toBe("Sign-in was cancelled."));
it("falls back for unknown codes", () => expect(signInErrorMessage("weird_code")).toBe("We couldn't sign you in. Try again."));
it("returns null without a code", () => expect(signInErrorMessage(null)).toBeNull());
```

- [ ] **Step 2: Run `pnpm vitest run src/lib/sign-in-errors.test.ts`.** Expected: FAIL.

- [ ] **Step 3: Implement**

- **`signInErrorMessage`:** return the messages in the tests; for `account_not_linked`, use "This email is linked to another sign-in method. Use the one you signed up with."
- **`signInWithProvider`:** calls `signIn.social({ provider, callbackURL: "/home", errorCallbackURL: "/" })`.
- **`ProviderButtons`** (client):
  - Google gets the `lg` primary button; GitHub and Apple get `lg` outline buttons. Labels come from Global Constraints.
  - While a redirect is pending, the clicked button shows a spinner and every button is `disabled`.
  - If `signIn.social` returns an error, show the `signInErrorMessage` toast and re-enable the buttons.
- **`SignInErrorToast`** (client): reads `useSearchParams().get("error")`, shows the toast once, then calls `router.replace("/")`. Wrap it in `<Suspense>` in `page.tsx`.
- **`hero.tsx`:** stays a server component. It gets `providers` from `page.tsx`, which calls `getEnabledProviders()`, and renders `<ProviderButtons>` in place of the two links.
- **`provider-icons.tsx`:** inline SVGs for the Google "G", GitHub mark, and Apple logo, sized by `className`, with `aria-hidden`.

- [ ] **Step 4: Run `pnpm vitest run src/lib/sign-in-errors.test.ts && pnpm typecheck`.** Expected: PASS. The remaining type errors are only in `delete-account-item.tsx` (Task 8).

- [ ] **Step 5: Commit**

```bash
git add src/components/provider-icons.tsx src/components/provider-buttons.tsx src/components/sign-in-error-toast.tsx src/lib/sign-in-errors.ts src/lib/sign-in-errors.test.ts src/sections/hero.tsx "src/app/(public)/page.tsx" src/hooks/use-auth.ts
git commit -m "feat: sign in with Google and GitHub from the landing page"
```

---

### Task 7: Settings → Account: username and sign-in methods

**Files:**
- Create: `src/components/dialog-edit-username.tsx`, `src/components/settings-sign-in-methods.tsx`
- Modify: `src/components/settings-account.tsx`, `src/components/dialog-settings.tsx`, `src/components/settings-tabs.tsx`, `src/contexts/current-user-context.tsx`, `src/app/(private)/(app)/layout.tsx`
- Enabled providers reach the client through `CurrentUserContext`: `HeaderActions` in the layout passes `enabledProviders={getEnabledProviders()}` to `CurrentUserProvider`, and the context value gains `enabledProviders: ProviderId[]` (default `[]`).

**Interfaces:**
- Consumes:
  - `validateUsername` (Task 1); the `PATCH` and `/available` endpoints (Task 4); `getEnabledProviders()` (Task 3).
  - `linkSocial`, `unlinkAccount`, `listAccounts`, `getSession` (Task 3); `ProviderIcon` and `ProviderId` (Task 6).
  - `useCurrentUser().setUser`.
- Produces:
  - `SettingsTabs` accepts an optional `defaultValue?: string`.
  - `SettingsDialog` opens itself when the URL has `?settings=<usage|integrations|account>`, selects that tab, then removes the param with `router.replace(pathname)`.

- [ ] **Step 1: Build `DialogEditUsername`**

- Built on `DialogWrapper`, with an input prefilled with the current username.
- **On every change:** run `validateUsername`, showing the format or reserved message.
- **After 300 ms of no typing:** if the value is valid and differs from the current username, `GET /available` and show "That username is taken" if needed. Ignore responses for stale input.
- **Save** is enabled only when the value is valid, available, and changed. It sends the `PATCH`, maps a 409 to the "taken" message, and on 200: `setUser(u => u && { ...u, username })`, `await getSession({ query: { disableCookieCache: true } })`, toast "Username updated", close.

- [ ] **Step 2: Build `SettingsSignInMethods`**

- Props: `providers: ProviderId[]`. It loads `listAccounts()` on mount.
- One `SettingsItem` per provider: icon plus name, description "Connected" or "Not connected".
- **Connect:** `linkSocial({ provider, callbackURL: "/home?settings=account" })`.
- **Disconnect:** `unlinkAccount({ providerId })`, then reload the list. It is disabled, wrapped in `TooltipWrapper` with "You need at least one way to sign in", when that provider is the only one connected.
- Errors show as a toast with the server message or a fallback.

- [ ] **Step 3: Update `SettingsAccount`**

- Order: Username row (`@username`, **Edit** opens the dialog), then Email row (description "From your sign-in provider"), then the Sign-in methods section, profile photo, log out, and delete account.
- Add the `?settings=` deep link to `SettingsDialog` and `defaultValue` to `SettingsTabs`.

- [ ] **Step 4: Verify in the browser** (`pnpm dev`, signed in):
  - Edit the username through the format, reserved, taken, and success paths; the header and settings update without a reload.
  - Open `/home?settings=account`; the dialog opens on the Account tab and the URL goes back to `/home`.

  Then run `pnpm lint && pnpm typecheck`. Expected: clean except `delete-account-item.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components src/app/"(private)"
git commit -m "feat: edit username and manage sign-in methods in settings"
```

---

### Task 8: Delete account without a password

**Files:**
- Modify: `src/components/delete-account-item.tsx`

**Interfaces:**
- Consumes: `useCurrentUser().user.username`; `deleteUser`, `signOut` (Task 3).

- [ ] **Step 1: Change the confirmation**

- Replace the password input with a text input labelled "Type **@{username}** to confirm". The delete button is enabled only on an exact match, with or without the leading `@`.
- Call `deleteUser({ callbackURL: "/" })`.
- If `res.error?.code === "SESSION_EXPIRED"`: toast "For your security, sign in again to delete your account.", then `signOut()` (which goes to `/`).
- Otherwise keep the existing success path, with `router.push("/")` instead of `/login`.

- [ ] **Step 2: Verify:** `pnpm typecheck && pnpm lint` are clean across the repo. In `pnpm dev`, delete a throwaway account signed in less than a day ago; it is deleted and you land on `/`.

- [ ] **Step 3: Commit**

```bash
git add src/components/delete-account-item.tsx
git commit -m "feat: confirm account deletion with the username"
```

---

### Task 9: Cypress, docs, and full verification

**Files:**
- Delete: `cypress/e2e/auth.cy.ts`
- Modify: `cypress/e2e/links.cy.ts`, `cypress/e2e/link-management.cy.ts` (top-level `describe` → `describe.skip` with the comment `// Skipped: needs a test-only login now that sign-in is OAuth-only (see docs/superpowers/specs/2026-09-26-usernames-oauth-signin-design.md §10).`)
- Modify: `CLAUDE.md`: replace the "Email verification" gotcha with "Sign-in is Google/GitHub only (Apple is enabled when its env vars exist); for local dev, create OAuth apps with localhost callbacks `http://localhost:3000/api/auth/callback/{google,github}`." Mention `username` in the architecture notes.

- [ ] **Step 1: Make the edits above.**

- [ ] **Step 2: Run the full checks**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 3: Manual checks** (spec §8; needs real Google and GitHub OAuth apps in `.env`)
  1. A new Google sign-in creates a user with a generated username.
  2. A seeded legacy **verified** password user signs in with a same-email Google account and sees their links.
  3. The same as 2 for a legacy **unverified** user (Review Focus 4).
  4. Settings: connect GitHub with a different email; disconnect Google; confirm the last provider cannot be disconnected.
  5. Change the username through the error paths and a success.
  6. MCP (Review Focus 5): run `npx @modelcontextprotocol/inspector` against `http://localhost:3000/api/mcp` while signed out. You land on `/`, pick Google, and land on the consent screen, not `/home`. After approving, the inspector lists the tools.
  7. `/login`, `/signup`, and `/verify-email` redirect to `/`; a signed-in visit to `/` goes to `/home`; `/?error=weird` shows the generic toast and the URL cleans itself.

- [ ] **Step 4: Commit**

```bash
git add -A cypress CLAUDE.md
git commit -m "chore: retire password-based e2e auth and update docs for OAuth sign-in"
```
