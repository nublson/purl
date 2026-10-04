"use client";

import { useEffect } from "react";

/**
 * Below this, a gap under the visual viewport is browser chrome (a toolbar
 * sliding), not an on-screen keyboard.
 */
const MIN_KEYBOARD_HEIGHT = 80;

/**
 * Keeps the page still when an on-screen keyboard opens. iOS doesn't shrink
 * the page for the keyboard: it pans the whole view up to reveal the
 * focused field, which here is pinned to the bottom, so the header and list
 * slid off the top.
 *
 * Instead, from `visualViewport`, this sets on `<html>`:
 * - `--keyboard-inset`: the keyboard's height (0 when closed). Things
 *   pinned to the bottom sit above it (via `--bottom-inset` in globals.css).
 * - `data-keyboard-open` and `--visual-height`: the page shrinks to the
 *   visible area, so the list ends above the keyboard instead of under it.
 * and scrolls the pan iOS adds back to the top. Pinch-zoom is left alone.
 */
export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const zoomed = viewport.scale > 1.01;
        // The keyboard is everything the visible area lost. Not minus
        // offsetTop: iOS pans by the keyboard's full height (as a window
        // scroll), so that would cancel it out. The root's clientHeight is
        // the layout viewport's height, not <html>'s own box, so shrinking
        // <html> below doesn't feed back into this measurement.
        const gap = Math.round(root.clientHeight - viewport.height);
        const keyboard = !zoomed && gap > MIN_KEYBOARD_HEIGHT ? gap : 0;
        root.style.setProperty("--keyboard-inset", `${keyboard}px`);
        if (keyboard) {
          root.style.setProperty("--visual-height", `${Math.round(viewport.height)}px`);
          root.setAttribute("data-keyboard-open", "");
          // Undo iOS's pan: the field is already above the keyboard.
          if (window.scrollY !== 0) window.scrollTo(0, 0);
        } else {
          root.style.removeProperty("--visual-height");
          root.removeAttribute("data-keyboard-open");
        }
      });
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      root.style.removeProperty("--keyboard-inset");
      root.style.removeProperty("--visual-height");
      root.removeAttribute("data-keyboard-open");
    };
  }, []);

  return null;
}
