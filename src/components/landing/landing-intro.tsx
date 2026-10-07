"use client";

import { useEffect, useLayoutEffect } from "react";
import {
  LANDING_SEEN_ATTR,
  hasSeenLanding,
  markLandingSeen,
} from "@/lib/landing-intro";

// Longer than the sequence (~1.5s), so it only fires when the sheen doesn't
// (reduced motion, or the sheen's animationend never arrives).
const FALLBACK_MS = 1800;

/**
 * Renders nothing. After the first-visit arrival ends (the sheen's
 * `animationend` on the pearl word, or a fallback timer) it remembers the
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

    const pearl = document.querySelector("[data-pearl-word]");
    const done = () => markLandingSeen(window.localStorage);

    pearl?.addEventListener("animationend", done, { once: true });
    const timer = window.setTimeout(done, FALLBACK_MS);

    return () => {
      pearl?.removeEventListener("animationend", done);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
