import { LINKS_ORIGIN_HEADER } from "@/lib/realtime-constants";

/**
 * Client-side link list events. Mutations (save, edit, delete) and remote
 * Realtime broadcasts emit `changed`; the home list listens and reloads only
 * the links it has loaded, instead of re-rendering the whole route.
 */

/** Identifies this browser tab in broadcasts so it can ignore its own echoes. */
export const LINKS_CLIENT_ORIGIN: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Headers to attach to link mutation requests. */
export const linksOriginHeaders: Record<string, string> = {
  [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
};

const target = new EventTarget();
const CHANGED = "changed";
const TOTAL = "total";

export function emitLinksChanged(): void {
  target.dispatchEvent(new Event(CHANGED));
}

export function onLinksChanged(listener: () => void): () => void {
  target.addEventListener(CHANGED, listener);
  return () => target.removeEventListener(CHANGED, listener);
}

/** Broadcasts the user's current saved-link count (for the usage meter). */
export function emitLinksTotal(total: number): void {
  target.dispatchEvent(new CustomEvent<number>(TOTAL, { detail: total }));
}

export function onLinksTotal(listener: (total: number) => void): () => void {
  const handler = (event: Event) =>
    listener((event as CustomEvent<number>).detail);
  target.addEventListener(TOTAL, handler);
  return () => target.removeEventListener(TOTAL, handler);
}
