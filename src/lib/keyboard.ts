/** Fields where keys are text, never app shortcuts. */
const TEXT_TARGETS =
  "input, textarea, select, [contenteditable=''], [contenteditable='true']";

/** Whether a key event's target is a text field (typing, not a shortcut). */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TEXT_TARGETS) !== null;
}

/**
 * Whether a dialog or menu is open: Radix locks page scrolling while one
 * is, and those handle their own keys.
 */
export function isOverlayOpen(): boolean {
  return document.body.hasAttribute("data-scroll-locked");
}
