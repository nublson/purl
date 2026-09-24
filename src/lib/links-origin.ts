import { LINKS_ORIGIN_HEADER } from "@/lib/realtime-constants";

/**
 * Identifies this browser tab on link mutations. The server echoes it in the
 * Realtime broadcast so the tab that made a change can ignore its own echo.
 */
export const LINKS_CLIENT_ORIGIN: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Headers to attach to link mutation requests. */
export const linksOriginHeaders: Record<string, string> = {
  [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
};
