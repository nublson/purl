/** Static placeholder for the signed-in header actions (save button, avatar) while they load. */
export function HeaderActionsFallback() {
  return (
    <div
      className="flex items-center justify-end gap-2"
      aria-hidden="true"
      data-slot="header-actions-fallback"
    >
      {/* Matches the save button, which only renders on hover-capable devices. */}
      <div className="hidden size-8 shrink-0 rounded-md bg-muted animate-pulse [@media(hover:hover)]:block" />
      <div className="size-8 shrink-0 rounded-full bg-muted animate-pulse" />
    </div>
  );
}
