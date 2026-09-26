import "server-only";

import { cookies, headers } from "next/headers";
import { isValidTimeZone, safeDecode, TIME_ZONE_COOKIE } from "@/utils/time-zone";

/**
 * Resolves the viewer's time zone with precedence: `tz` cookie →
 * `x-vercel-ip-timezone` header → `"UTC"`. Invalid values (missing, decode
 * failure, unrecognized zone) fall through to the next source; nothing
 * throws on a bad zone.
 */
export function resolveRequestTimeZone(input: {
  cookie: string | null | undefined;
  header: string | null | undefined;
}): string {
  const { cookie, header } = input;

  if (cookie) {
    const decoded = safeDecode(cookie);
    if (isValidTimeZone(decoded)) return decoded;
  }

  if (header && isValidTimeZone(header)) return header;

  return "UTC";
}

/** Resolves the current request's time zone from cookies and Vercel's geo header. */
export async function getRequestTimeZone(): Promise<string> {
  const cookie = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  const header = (await headers()).get("x-vercel-ip-timezone");
  return resolveRequestTimeZone({ cookie, header });
}
