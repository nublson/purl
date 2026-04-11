type HeaderActionsFallbackProps = {
  /** `public` — sign-in / get-started buttons. `private` — search, upload, avatar. */
  variant?: "public" | "private";
};

/** Static placeholder for header CTAs while session or data loads. */
export function HeaderActionsFallback({
  variant = "public",
}: HeaderActionsFallbackProps) {
  if (variant === "private") {
    return (
      <div
        className="flex items-center justify-end gap-2"
        aria-hidden="true"
        data-slot="header-actions-fallback"
        data-variant="private"
      >
        <div className="size-8 shrink-0 rounded-md bg-muted animate-pulse" />
        <div className="size-8 shrink-0 rounded-md bg-muted animate-pulse" />
        <div className="size-8 shrink-0 rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2"
      aria-hidden="true"
      data-slot="header-actions-fallback"
      data-variant="public"
    >
      <div className="h-9 w-18 rounded-md bg-muted animate-pulse" />
      <div className="h-9 w-22 rounded-md bg-muted animate-pulse" />
    </div>
  );
}
