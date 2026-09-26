/**
 * Shared hover state for link previews, following the tooltip rule: the
 * first preview waits PREVIEW_OPEN_DELAY_MS so passing over rows doesn't
 * open cards, but once one has opened, other rows open theirs immediately.
 * The list stays "warm" until the pointer leaves it, so date headings
 * between groups don't reset the delay.
 */
export const PREVIEW_OPEN_DELAY_MS = 400;

let warm = false;
let openCount = 0;
let closeActive: (() => void) | null = null;

/** Delay before opening a row's preview on hover. */
export function previewOpenDelay() {
  return warm || openCount > 0 ? 0 : PREVIEW_OPEN_DELAY_MS;
}

/**
 * Call when a preview opens, with a function that closes it. Any other open
 * preview closes right away so two cards never overlap. Only pointer opens
 * warm the list: a keyboard-opened preview says nothing about where the
 * pointer is. Returns the cleanup for when this one closes.
 */
export function trackPreviewOpen(
  close: () => void,
  { viaPointer }: { viaPointer: boolean },
) {
  if (closeActive) closeActive();
  closeActive = close;
  if (viaPointer) warm = true;
  openCount += 1;
  return () => {
    openCount -= 1;
    if (closeActive === close) closeActive = null;
  };
}

/** Call when the pointer leaves the list, and when the list unmounts. */
export function coolPreviews() {
  warm = false;
}
