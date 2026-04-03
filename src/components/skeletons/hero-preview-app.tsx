/** Matches PreviewApp shell dimensions to limit layout shift while the chunk loads. */
export function HeroPreviewAppSkeleton() {
  return (
    <div
      className="bg-elevated dark:shadow-contrast h-[320px] max-w-2xl w-full translate-y-px overflow-hidden rounded-t-xl border border-[#1F1F1F] flex flex-col items-center justify-start"
      aria-hidden="true"
      data-slot="hero-preview-app-skeleton"
    >
      <div className="w-full px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-full bg-muted animate-pulse" />
          <div className="size-3 rounded-full bg-muted animate-pulse" />
          <div className="size-3 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="size-7 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="w-full flex-1 flex flex-col gap-3 px-4 pt-8">
        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
        <div className="h-14 w-full rounded-lg bg-muted animate-pulse" />
        <div className="h-14 w-full rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  );
}
