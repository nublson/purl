/** Placeholder while below-the-fold marketing sections load. */
export function BelowFoldSectionSkeleton() {
  return (
    <div
      className="w-full max-w-4xl mx-auto py-16 px-4 space-y-6"
      aria-hidden="true"
    >
      <div className="h-8 w-48 rounded-md bg-muted animate-pulse mx-auto" />
      <div className="h-12 w-3/4 max-w-xl rounded-md bg-muted animate-pulse mx-auto" />
      <div className="h-40 w-full rounded-lg bg-muted animate-pulse" />
    </div>
  );
}
