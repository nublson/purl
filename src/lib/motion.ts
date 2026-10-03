/** `--ease-out-strong` (globals.css) for Motion: enters, exits and swaps in the UI. */
export const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const;

/**
 * A link's real details arriving in place of a placeholder (after a save,
 * or a Save row's preview): fade in as the blur clears, 200ms. Reduced
 * motion: fade only.
 */
export const ARRIVE =
  "animate-in fade-in-0 blur-in-4 duration-200 ease-out-strong motion-reduce:[--tw-enter-blur:0]";
/** `ARRIVE` for the favicon: also grows from 90%. */
export const ARRIVE_ICON = `${ARRIVE} zoom-in-90 motion-reduce:[--tw-enter-scale:1]`;
/** `ARRIVE`, 40ms later (the domain, after the title); hidden until it starts. */
export const ARRIVE_LATE = `${ARRIVE} delay-40 fill-mode-backwards`;
