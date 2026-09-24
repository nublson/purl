/** Must match broadcast event name in `realtime-broadcast.ts` and client subscription. */
export const LINKS_CHANGED_EVENT = "linksChanged";

/**
 * Request header carrying the browser tab's id on link mutations. The server
 * echoes it in the broadcast payload so the originating tab can skip its own
 * (already-applied) change instead of reloading the list twice.
 */
export const LINKS_ORIGIN_HEADER = "x-purl-origin";

const ORIGIN_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Returns the origin id if it is well-formed, otherwise null. */
export function parseLinksOrigin(value: string | null | undefined): string | null {
  return value && ORIGIN_PATTERN.test(value) ? value : null;
}
