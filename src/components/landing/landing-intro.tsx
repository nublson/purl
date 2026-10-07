"use client";

import { useEffect } from "react";
import {
  LANDING_SEEN_ATTR,
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
