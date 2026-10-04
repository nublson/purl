"use client";

import { useSyncExternalStore } from "react";

/** A touch screen narrower than `md`: phones, not tablets or desktops. */
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
