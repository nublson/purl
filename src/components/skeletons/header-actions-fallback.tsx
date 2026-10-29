/** Static placeholder for the signed-in header actions (+ button, view switch, avatar) while they load. */
export function HeaderActionsFallback() {
  return (
    <div
      className="flex items-center justify-end gap-2"
      aria-hidden="true"
      data-slot="header-actions-fallback"
    >
      {/* The + button, which only renders on hover-capable devices. */}
      <div className="hidden size-8 shrink-0 rounded-md bg-muted animate-pulse [@media(hover:hover)]:block" />
      {/* The List / Grid switch: one 60px segmented control (one 32px button on phones). */}
      <div className="h-8 w-[60px] shrink-0 rounded-[10px] bg-muted animate-pulse phone:w-8" />
      <div className="h-5 w-px shrink-0 bg-border" />
      <div className="size-8 shrink-0 rounded-full bg-muted animate-pulse" />
    </div>
  );
}
