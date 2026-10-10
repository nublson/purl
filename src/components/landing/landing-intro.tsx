"use client";

import { useEffect, useLayoutEffect } from "react";
import {
  LANDING_SEEN_ATTR,
  hasSeenLanding,
  markLandingSeen,
} from "@/lib/landing-intro";

// Just past the arrival's last beat (the panel's rows, ~1.3s), so a visitor
// who leaves mid-arrival sees it again next time.
const SEEN_AFTER_MS = 1400;

/**
 * Renders nothing. Once the first-visit arrival has played it remembers the
 * visit, so later loads show the settled page.
 */
export function LandingIntro() {
  // Client navigations (e.g. after logging out) don't run the root layout's
  // script, so settle the page here, before paint.
  useLayoutEffect(() => {
    let seen = false;
    try {
      seen = hasSeenLanding(window.localStorage);
    } catch {
      // Storage access can throw; treat as a first visit.
    }
    if (seen) document.documentElement.setAttribute(LANDING_SEEN_ATTR, "true");
  }, []);

  useEffect(() => {
    if (document.documentElement.hasAttribute(LANDING_SEEN_ATTR)) return;

    const timer = window.setTimeout(
      () => markLandingSeen(window.localStorage),
      SEEN_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
