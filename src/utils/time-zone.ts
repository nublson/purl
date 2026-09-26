/**
 * Client-safe time zone helpers: no `server-only`, no `next/headers`.
 * Shared by the server-side resolver (`@/lib/time-zone`) and client code
 * that reads/writes the `tz` cookie directly via `document.cookie`.
 */

export const TIME_ZONE_COOKIE = "tz";

/** `decodeURIComponent` that returns the input unchanged if it isn't encoded. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** True when `value` is a non-empty string that `Intl` recognizes as an IANA time zone. */
export function isValidTimeZone(
  value: string | null | undefined,
): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a `document.cookie`-style string (`"a=1; tz=Europe%2FLisbon; b=2"`)
 * and returns the decoded `tz` value, or null if absent or invalid.
 */
export function readTimeZoneCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== TIME_ZONE_COOKIE) continue;
    const value = safeDecode(part.slice(eq + 1).trim());
    return isValidTimeZone(value) ? value : null;
  }
  return null;
}

/** Serializes a `Set-Cookie`/`document.cookie` value that persists `zone` for a year. */
export function serializeTimeZoneCookie(zone: string): string {
  return `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Decides whether the client should write a new `tz` cookie: only when the
 * browser's zone is valid, the server resolved a different zone (so a
 * refresh would actually change grouping), and the cookie doesn't already
 * hold that value (so we don't force a reload on every mount).
 */
export function timeZoneToPersist(input: {
  browser: string;
  server: string;
  cookie: string | null;
}): string | null {
  const { browser, server, cookie } = input;
  if (!isValidTimeZone(browser)) return null;
  if (browser === server) return null;
  if (browser === cookie) return null;
  return browser;
}
