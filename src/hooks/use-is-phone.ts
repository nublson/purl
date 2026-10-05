"use client";

import { useSyncExternalStore } from "react";

/**
 * A touch screen narrower than `md`: phones, not tablets or desktops. Same
 * query as the `phone:` CSS variant (globals.css); prefer that for what
 * shows on first paint, since this is false until hydration.
 */
const PHONE_QUERY = "(pointer: coarse) and (max-width: 767px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether this is a phone (false during server rendering). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
