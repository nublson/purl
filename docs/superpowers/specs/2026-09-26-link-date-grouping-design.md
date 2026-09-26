# Link date grouping — design

Date: 2026-09-26
Status: approved design, pending implementation plan

## Problem

`/home` lists links newest-first (`createdAt desc`) and groups them under fixed
relative labels: Today, This week, Last week, This month, Last month, This year,
Last year, Older. The coarse buckets ("This year", "Older") grow large and stop
helping the user orient in time.

Grouping also runs on the server (`home-shell-loader.tsx`, `GET /api/links`)
with no time zone handling, so on Vercel it uses UTC. Links saved in the user's
evening can land under the wrong day, and finer labels would make that worse.

## Goals

- Finer, calendar-based headings further back in time.
- Headings computed in the user's time zone, consistently between SSR and
  client reloads, with no hydration mismatch.

## Non-goals

- Changing the sort order (stays `createdAt desc`), pagination, or the schema.
- Grouping in the v1 API or MCP (they return flat lists; unchanged).
- Localized month names (UI is English-only).

## Heading rules

`getDateGroupLabel(date, now, timeZone)` in `src/utils/formatter.ts` replaces
`getRelativeDateLabel`. Both `date` and `now` are converted to calendar days
(year, month, day) in `timeZone` before comparison. First match wins:

| Label | Rule |
|---|---|
| `Today` | same calendar day as `now` |
| `Yesterday` | the calendar day before `now` |
| `This week` | on or after Monday of `now`'s ISO week (Monday start), not Today/Yesterday |
| `Last week` | Monday–Sunday of the previous week |
| `<Month>` (e.g. `September`) | same calendar year as `now` |
| `<Month> <Year>` (e.g. `December 2025`) | any earlier year |

Consequences:

- When today is Monday or Tuesday, `This week` is empty and does not render.
- `Last week` can span a month boundary; its links are not repeated under the
  month heading, which then holds only the remainder of that month.
- Day arithmetic is done on calendar-day values, not by subtracting
  milliseconds, so DST transitions do not shift days.

## Time zone resolution

New server-only module `src/lib/time-zone.ts`:

```ts
export const TIME_ZONE_COOKIE = "tz";
export function isValidTimeZone(value: string | null | undefined): value is string;
export function resolveRequestTimeZone(input: {
  cookie: string | null | undefined;
  header: string | null | undefined; // x-vercel-ip-timezone
}): string;
```

Precedence: `tz` cookie → `x-vercel-ip-timezone` header → `"UTC"`. A value is
valid only if `new Intl.DateTimeFormat("en-US", { timeZone: value })` does not
throw; invalid values fall through to the next source. A small helper reads the
cookie and header from `next/headers` (loader) or the `NextRequest` (API route)
and delegates to `resolveRequestTimeZone`.

`isValidTimeZone` lives in a module that is safe to import from the client (the
browser side only needs the cookie name and validation), e.g.
`src/utils/time-zone.ts`, with `src/lib/time-zone.ts` holding the
request-reading parts.

### First-visit correction

The loader passes the resolved `timeZone` to `HomeShell`. On mount, `HomeShell`
reads `Intl.DateTimeFormat().resolvedOptions().timeZone`. If it is valid and
differs from the server's value, it:

1. writes `tz=<zone>; path=/; max-age=31536000; samesite=lax`, then
2. calls the existing `reload()` once, which fetches `/api/links` with the new
   cookie and replaces the groups.

If they match, nothing happens. After the first correction the cookie keeps
every later request correct, including when the user travels (the check runs on
every mount and rewrites the cookie when the zone changes).

## Grouping and merging

`src/utils/links.ts`:

- `groupLinksByDate(links, { now = new Date(), timeZone })` sorts newest-first
  and emits groups in first-seen label order. `LABEL_ORDER` is removed.
- `mergeLinkGroups(current, next)` preserves first-seen label order across
  `current` then `next`, concatenating same-label groups (a month split across a
  page boundary) and deduplicating by link id. This relies on pages arriving
  newest-first, which the cursor pagination guarantees.

Callers:

- `home-shell-loader.tsx`: resolves the zone, calls
  `groupLinksByDate(links, { timeZone })`, passes `timeZone` to `HomeShell`.
- `GET /api/links`: resolves the zone from the request, groups with it, and
  adds `timeZone` to the JSON response (informational; client does not require
  it).

## Error handling

- Invalid or unknown zones anywhere fall back to the next source, ending at UTC;
  grouping never throws on a bad zone.
- Cookie write failure (e.g. cookies disabled) leaves the server-grouped list in
  place; no retry loop, since the reload is triggered at most once per mount.

## Testing (Vitest, TDD)

`src/utils/formatter.test.ts` (replacing the `getRelativeDateLabel` cases):

- Each label, with a fixed `now` and explicit zone.
- Week boundaries: Sunday 23:59 vs Monday 00:00; `now` on Monday (no
  `This week`); `now` on Sunday.
- Year boundary: Dec 31 vs Jan 1 → `December 2025` vs `January`.
- Zone sensitivity: a UTC instant that is "Today" in `UTC` but "Yesterday" in
  `America/Sao_Paulo`, and one near midnight in `Europe/Lisbon`.
- DST: a date across a DST switch still lands on the right calendar day.

`src/utils/links.test.ts`:

- Groups emitted in chronological label order, links newest-first within.
- `mergeLinkGroups` joins a month split across pages and drops duplicates.

`src/lib/time-zone.test.ts`:

- Cookie beats header; header beats UTC; invalid cookie falls through to
  header; both invalid → UTC.

## Files touched

- `src/utils/formatter.ts` (+ test)
- `src/utils/links.ts` (+ test)
- `src/utils/time-zone.ts` (new, client-safe)
- `src/lib/time-zone.ts` (new, server-only) (+ test)
- `src/app/(private)/(app)/home/home-shell-loader.tsx`
- `src/app/api/links/route.ts`
- `src/components/home-shell.tsx`
