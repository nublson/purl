/**
 * The search field's surface (pinned to the bottom, raised, layered
 * shadow), shared by `LinkOmnibox` and the page skeleton so the field
 * doesn't jump when the page loads. Plain module: server components can
 * use it.
 */
export const OMNIBOX_SHELL =
  "fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mx-auto flex h-11 w-[calc(100%-2rem)] max-w-2xl items-center gap-2 rounded-xl bg-popover ps-3 pe-1.5 text-popover-foreground shadow-[0_0_0_1px_var(--border),0_2px_4px_-1px_oklch(0_0_0/0.12),0_8px_24px_-4px_oklch(0_0_0/0.24)]";
