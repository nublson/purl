/** Static placeholder for header CTAs while the client session island loads. */
export function HeaderActionsFallback() {
  return (
    <div
      className="flex items-center gap-2"
      aria-hidden="true"
      data-slot="header-actions-fallback"
    >
      <div className="h-9 w-18 rounded-md bg-muted animate-pulse" />
      <div className="h-9 w-22 rounded-md bg-muted animate-pulse" />
    </div>
  );
}
