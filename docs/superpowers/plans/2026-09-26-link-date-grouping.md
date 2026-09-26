# Link Date Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/home`'s coarse relative date buckets with Today / Yesterday / This week / Last week / per-month headings, computed in the user's time zone.

**Architecture:** A pure labeler (`getDateGroupLabel`) converts instants to calendar days in a given IANA zone via `Intl` and picks a heading. `groupLinksByDate` / `mergeLinkGroups` switch from a fixed label order to first-seen order. The server resolves the zone per request (`tz` cookie → `x-vercel-ip-timezone` → UTC); `HomeShell` persists the browser's zone and reloads once when the server guessed wrong.

**Tech Stack:** Next.js App Router, TypeScript, Vitest (node env), `Intl.DateTimeFormat`.

**Spec:** `docs/superpowers/specs/2026-09-26-link-date-grouping-design.md`

## Global Constraints

- Sort order stays `createdAt desc`; pagination, schema, v1 API and MCP are untouched.
- Weeks start Monday. Labels exactly: `Today`, `Yesterday`, `This week`, `Last week`, `<Month>` (current year, e.g. `September`), `<Month> <Year>` (earlier years, e.g. `December 2025`). English month names.
- Zone precedence: `tz` cookie → `x-vercel-ip-timezone` header → `"UTC"`. Invalid zones fall through; nothing throws on a bad zone.
- Cookie: name `tz`, `path=/; max-age=31536000; samesite=lax`, value `encodeURIComponent(zone)`.
- Day math on calendar-day values, never raw millisecond subtraction (DST-safe).
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` green at the end of every task.

## Review Focus

1. **Future `createdAt`** (client/server clock skew, link a few minutes "ahead" of `now`) → `Today`, never a month label. Test in Task 1.
2. **Zones with `+`/`-` in the name** (`Etc/GMT+3`) survive cookie write → read round-trip, whether or not the cookie value arrives URL-decoded. Tests in Task 3.
3. **Browser zone the server's ICU rejects, or cookie already matches browser but server still differs** → no reload on every mount; reload only when the cookie actually changes. Test in Task 3 (`timeZoneToPersist`).
4. **Week spanning a year boundary** (now Fri 2026-01-02; Mon 2025-12-29 is `This week`, 2025-12-24 is `Last week`, not `December 2025`). Test in Task 1.
5. **Empty link list** → `[]` from `groupLinksByDate`; merging with an empty page leaves groups unchanged. Test in Task 2.

---

### Task 1: `getDateGroupLabel`

**Files:**
- Modify: `src/utils/formatter.ts` (add below `getRelativeDateLabel`; leave the old function in place until Task 2)
- Test: `src/utils/formatter.test.ts` (new `describe("getDateGroupLabel")`)

**Interfaces:**
- Produces: `getDateGroupLabel(date: Date, now: Date, timeZone: string): string`

- [ ] **Step 1: Write the failing tests.** Use explicit UTC instants (`new Date("2026-09-26T12:00:00Z")`) and no fake timers. `now` = Sat 2026-09-26 12:00Z unless stated.

```ts
const now = new Date("2026-09-26T12:00:00Z"); // Saturday
const label = (iso: string, tz = "UTC", n = now) => getDateGroupLabel(new Date(iso), n, tz);

it("Today / Yesterday", () => {
  expect(label("2026-09-26T00:00:00Z")).toBe("Today");
  expect(label("2026-09-25T23:59:59Z")).toBe("Yesterday");
});
it("future instant is Today", () => expect(label("2026-09-26T12:05:00Z")).toBe("Today"));
it("This week starts Monday", () => {
  expect(label("2026-09-21T00:00:00Z")).toBe("This week");   // Monday
  expect(label("2026-09-20T23:59:59Z")).toBe("Last week");   // Sunday before
  expect(label("2026-09-14T00:00:00Z")).toBe("Last week");   // previous Monday
  expect(label("2026-09-13T23:59:59Z")).toBe("September");
});
it("no This week on Monday or Tuesday", () => {
  const tue = new Date("2026-09-22T12:00:00Z");
  expect(label("2026-09-21T09:00:00Z", "UTC", tue)).toBe("Yesterday");
  expect(label("2026-09-20T09:00:00Z", "UTC", tue)).toBe("Last week");
});
it("months in the current year, month + year before", () => {
  expect(label("2026-01-01T00:00:00Z")).toBe("January");
  expect(label("2025-12-31T23:59:59Z")).toBe("December 2025");
});
it("week spanning a year boundary", () => {
  const fri = new Date("2026-01-02T12:00:00Z");
  expect(label("2025-12-29T09:00:00Z", "UTC", fri)).toBe("This week");
  expect(label("2025-12-24T09:00:00Z", "UTC", fri)).toBe("Last week");
  expect(label("2025-12-20T09:00:00Z", "UTC", fri)).toBe("December 2025");
});
it("uses the given zone", () => {
  expect(label("2026-09-26T01:00:00Z", "UTC")).toBe("Today");
  expect(label("2026-09-26T01:00:00Z", "America/Sao_Paulo")).toBe("Yesterday");
  const lisbonNow = new Date("2026-09-26T23:30:00Z"); // 00:30 on the 27th in Lisbon (UTC+1)
  expect(label("2026-09-26T22:00:00Z", "Europe/Lisbon", lisbonNow)).toBe("Yesterday");
  expect(label("2026-09-26T22:00:00Z", "UTC", lisbonNow)).toBe("Today");
});
it("DST switch does not shift days", () => {
  // Europe/Lisbon springs forward 2026-03-29 01:00Z; now = Mon 2026-03-30 10:00Z
  const mon = new Date("2026-03-30T10:00:00Z");
  expect(label("2026-03-29T00:30:00Z", "Europe/Lisbon", mon)).toBe("Yesterday");
  expect(label("2026-03-28T23:30:00Z", "Europe/Lisbon", mon)).toBe("Last week");
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run src/utils/formatter.test.ts` → FAIL, `getDateGroupLabel` is not exported.

- [ ] **Step 3: Implement `getDateGroupLabel`.** Approach: a private `toCalendarDay(date, timeZone): number` that reads `year/month/day` via `new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date)` and returns `Date.UTC(y, m - 1, d) / 86_400_000` (an integer day index). With `today = toCalendarDay(now)` and `day = toCalendarDay(date)`: `day >= today` → Today; `today - 1` → Yesterday; `mondayThisWeek = today - ((new Date(today * 86_400_000).getUTCDay() + 6) % 7)`; `day >= mondayThisWeek` → This week; `day >= mondayThisWeek - 7` → Last week; else month name from `new Date(day * 86_400_000)` formatted with `{ month: "long", timeZone: "UTC" }`, suffixed with ` <year>` when its UTC year differs from `today`'s.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run src/utils/formatter.test.ts` → PASS (old `getRelativeDateLabel` tests still pass).

- [ ] **Step 5: Commit.** `git commit -am "feat: add time-zone-aware date group labels"` (with the Co-Authored-By trailer).

---

### Task 2: Grouping and merging in first-seen order

**Files:**
- Modify: `src/utils/links.ts`, `src/utils/formatter.ts` (delete `getRelativeDateLabel`)
- Modify callers: `src/app/(private)/(app)/home/home-shell-loader.tsx:15`, `src/app/api/links/route.ts:53` — pass `{ timeZone: "UTC" }` for now (Task 4 replaces it)
- Test: `src/utils/links.test.ts`, `src/utils/formatter.test.ts` (delete the `getRelativeDateLabel` describe)

**Interfaces:**
- Consumes: `getDateGroupLabel` (Task 1)
- Produces: `groupLinksByDate(links: Link[], options: { now?: Date; timeZone: string }): LinkGroup[]`; `mergeLinkGroups(current: LinkGroup[], next: LinkGroup[]): LinkGroup[]` (same signature, new ordering)

- [ ] **Step 1: Rewrite the failing tests.** Replace the fake-timer setup with `const opts = { now: new Date("2026-09-26T12:00:00Z"), timeZone: "UTC" }`.
  - `groups links under chronological labels`: links at `09-26`, `09-25`, `09-22`, `09-15`, `08-10`, `2025-12-01` (shuffled input) → labels `["Today","Yesterday","This week","Last week","August","December 2025"]`.
  - `sorts newest-first within a group` (keep existing case, on `09-26` 10:00 / 12:00).
  - `returns [] for no links`: `groupLinksByDate([], opts)` → `[]`.
  - `mergeLinkGroups joins a label split across pages`: current `[{August:[a]}]`, next `[{August:[b]},{July:[c]}]` → `[{August:[a,b]},{July:[c]}]`.
  - `mergeLinkGroups drops duplicates` (keep existing case).
  - `mergeLinkGroups with an empty page`: `mergeLinkGroups(groups, [])` deep-equals `groups`.

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run src/utils/links.test.ts` → FAIL (labels / signature).

- [ ] **Step 3: Implement.** Remove `LABEL_ORDER`. `groupLinksByDate`: sort desc by `createdAt`, bucket with a `Map<string, Link[]>` keyed by `getDateGroupLabel(link.createdAt, now ?? new Date(), timeZone)` (Map preserves insertion order), emit entries. `mergeLinkGroups`: same Map over `[...current, ...next]` with the existing `seen` id set, emit entries, drop empty groups. Delete `getRelativeDateLabel` and its tests; update the two callers.

- [ ] **Step 4: Verify.** `pnpm test && pnpm typecheck && pnpm lint` → all pass.

- [ ] **Step 5: Commit.** `feat: group links by calendar weeks and months`.

---

### Task 3: Time zone resolution helpers

**Files:**
- Create: `src/utils/time-zone.ts` (client-safe, no `server-only`)
- Create: `src/lib/time-zone.ts` (`import "server-only"`)
- Test: `src/utils/time-zone.test.ts`, `src/lib/time-zone.test.ts`

**Interfaces:**
- Produces (`src/utils/time-zone.ts`):
  - `TIME_ZONE_COOKIE = "tz"`
  - `isValidTimeZone(value: string | null | undefined): value is string`
  - `readTimeZoneCookie(cookieHeader: string): string | null` — parses a `document.cookie`-style string, decodes, returns only a valid zone
  - `serializeTimeZoneCookie(zone: string): string` — `tz=<encoded>; path=/; max-age=31536000; samesite=lax`
  - `timeZoneToPersist(input: { browser: string; server: string; cookie: string | null }): string | null` — the zone to write, or `null`
- Produces (`src/lib/time-zone.ts`):
  - `resolveRequestTimeZone(input: { cookie: string | null | undefined; header: string | null | undefined }): string`
  - `getRequestTimeZone(): Promise<string>` — reads `cookies()` / `headers()` from `next/headers`, delegates

- [ ] **Step 1: Write failing tests.**

```ts
// src/utils/time-zone.test.ts
expect(isValidTimeZone("Europe/Lisbon")).toBe(true);
expect(isValidTimeZone("Mars/Base")).toBe(false);
expect(isValidTimeZone("")).toBe(false);
expect(isValidTimeZone(null)).toBe(false);
expect(readTimeZoneCookie("a=1; tz=Etc%2FGMT%2B3; b=2")).toBe("Etc/GMT+3");
expect(readTimeZoneCookie("tz=Mars%2FBase")).toBeNull();
expect(readTimeZoneCookie("")).toBeNull();
expect(readTimeZoneCookie(serializeTimeZoneCookie("Etc/GMT+3").split(";")[0])).toBe("Etc/GMT+3");
expect(serializeTimeZoneCookie("Europe/Lisbon")).toBe("tz=Europe%2FLisbon; path=/; max-age=31536000; samesite=lax");
// timeZoneToPersist
expect(timeZoneToPersist({ browser: "Europe/Lisbon", server: "UTC", cookie: null })).toBe("Europe/Lisbon");
expect(timeZoneToPersist({ browser: "Europe/Lisbon", server: "Europe/Lisbon", cookie: null })).toBeNull();
expect(timeZoneToPersist({ browser: "Europe/Lisbon", server: "UTC", cookie: "Europe/Lisbon" })).toBeNull(); // server can't use it; don't reload every mount
expect(timeZoneToPersist({ browser: "Mars/Base", server: "UTC", cookie: null })).toBeNull();

// src/lib/time-zone.test.ts
expect(resolveRequestTimeZone({ cookie: "Europe/Lisbon", header: "America/New_York" })).toBe("Europe/Lisbon");
expect(resolveRequestTimeZone({ cookie: null, header: "America/New_York" })).toBe("America/New_York");
expect(resolveRequestTimeZone({ cookie: "Mars/Base", header: "America/New_York" })).toBe("America/New_York");
expect(resolveRequestTimeZone({ cookie: "Mars/Base", header: "nope" })).toBe("UTC");
expect(resolveRequestTimeZone({ cookie: undefined, header: undefined })).toBe("UTC");
expect(resolveRequestTimeZone({ cookie: "Etc%2FGMT%2B3", header: null })).toBe("Etc/GMT+3"); // raw, still encoded
expect(resolveRequestTimeZone({ cookie: "Etc/GMT+3", header: null })).toBe("Etc/GMT+3");     // already decoded
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run src/utils/time-zone.test.ts src/lib/time-zone.test.ts` → FAIL, modules missing.

- [ ] **Step 3: Implement.** `isValidTimeZone`: non-empty string and `new Intl.DateTimeFormat("en-US", { timeZone: value })` does not throw. Decoding: a private `safeDecode` (`decodeURIComponent` in try/catch, returning the input on error) used by both `readTimeZoneCookie` and `resolveRequestTimeZone` — decoding an already-decoded zone is a no-op. `timeZoneToPersist` returns `browser` only when it is valid, differs from `server`, and differs from `cookie`. `getRequestTimeZone` passes `(await cookies()).get(TIME_ZONE_COOKIE)?.value` and `(await headers()).get("x-vercel-ip-timezone")`.

- [ ] **Step 4: Verify.** Targeted run → PASS; then `pnpm test && pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit.** `feat: resolve the request time zone from cookie or Vercel header`.

---

### Task 4: Wire the zone through the loader, API, and HomeShell

**Files:**
- Modify: `src/app/(private)/(app)/home/home-shell-loader.tsx`
- Modify: `src/app/api/links/route.ts` (GET only)
- Modify: `src/components/home-shell.tsx`

**Interfaces:**
- Consumes: `getRequestTimeZone`, `resolveRequestTimeZone` (Task 3, server); `TIME_ZONE_COOKIE`, `readTimeZoneCookie`, `serializeTimeZoneCookie`, `timeZoneToPersist` (Task 3, client); `groupLinksByDate` (Task 2)
- Produces: `HomeShell` prop `timeZone: string`; `GET /api/links` JSON gains `timeZone: string`

- [ ] **Step 1: Loader.** Add `getRequestTimeZone()` to the existing `Promise.all`; pass `{ timeZone }` to `groupLinksByDate` and `timeZone` to `HomeShell`.

- [ ] **Step 2: API route.** In `GET`, `const timeZone = resolveRequestTimeZone({ cookie: request.cookies.get(TIME_ZONE_COOKIE)?.value, header: request.headers.get("x-vercel-ip-timezone") })`; group with it; add `timeZone` to the response body.

- [ ] **Step 3: HomeShell.** Add the `timeZone` prop. Add a mount-only effect (placed after `reload` is defined): read `Intl.DateTimeFormat().resolvedOptions().timeZone`, compute `timeZoneToPersist({ browser, server: timeZone, cookie: readTimeZoneCookie(document.cookie) })`; if non-null, `document.cookie = serializeTimeZoneCookie(zone)` then `void reload()`. Wrap the cookie write in try/catch (leave the server-grouped list on failure). The `LinksPageResponse` type gains optional `timeZone?: string` (unused beyond typing).

- [ ] **Step 4: Verify statically.** `pnpm lint && pnpm typecheck && pnpm test` → all pass.

- [ ] **Step 5: Verify in the browser.** Start the dev server via preview (`pnpm dev`, port 3000), sign in with a local test account, open `/home`:
  - Headings render in the new scheme (seed links across weeks/months via `POST /api/links` or DB `createdAt` edits if needed).
  - `document.cookie` contains `tz=<browser zone>` after first load; network shows exactly one extra `GET /api/links` on the first visit and none on reload.
  - With the pane's time zone emulated or cookie set to `Asia/Tokyo`, a link saved "today" UTC-evening lands under the Tokyo-correct heading after reload.
  - No hydration warnings in the console.

- [ ] **Step 6: Commit.** `feat: group /home links in the viewer's time zone`.
