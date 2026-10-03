/** Fields where keys are text, never app shortcuts. */
const TEXT_TARGETS =
  "input, textarea, select, [contenteditable=''], [contenteditable='true']";

/** Whether a key event's target is a text field (typing, not a shortcut). */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TEXT_TARGETS) !== null;
}

/**
 * Whether a dialog, menu or popover is open; those handle their own keys.
 * Modal ones lock page scrolling; popovers (e.g. Add links) are non-modal,
 * so they're found by their open content instead. Tooltips don't count.
 */
export function isOverlayOpen(): boolean {
  return (
    document.body.hasAttribute("data-scroll-locked") ||
    document.querySelector('[data-slot="popover-content"][data-state="open"]') !==
      null
  );
}
