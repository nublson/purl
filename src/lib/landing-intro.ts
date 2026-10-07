// Storage key for marking the landing page as seen.
export const LANDING_SEEN_KEY = "purl:landing-seen";

// HTML attribute set on the document element when the landing page has been seen.
export const LANDING_SEEN_ATTR = "data-landing-seen";

// Check whether the user has seen the landing page before.
export function hasSeenLanding(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  if (!storage) {
    return false;
  }
  try {
    return !!storage.getItem(LANDING_SEEN_KEY);
  } catch {
    return false;
  }
}

// Mark the landing page as seen in storage.
export function markLandingSeen(storage: Pick<Storage, "setItem"> | null | undefined): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(LANDING_SEEN_KEY, "1");
  } catch {
    // Storage may be unavailable or disabled; silently ignore.
  }
}

// Inline script to set the landing-seen attribute on initial page load.
export const LANDING_SEEN_SCRIPT = `(function() {
  try {
    if (localStorage.getItem("purl:landing-seen")) {
      document.documentElement.setAttribute("data-landing-seen", "true");
    }
  } catch {}
})();`;
