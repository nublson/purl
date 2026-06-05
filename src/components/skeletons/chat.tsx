import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS: Array<{ lines: string[] }> = [
  { lines: ["w-40"] },
  { lines: ["w-56", "w-44"] },
  { lines: ["w-32"] },
  { lines: ["w-48", "w-36", "w-52"] },
];

export function ChatPageSkeleton() {
  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-50 flex flex-col transform-none"
        aria-hidden
      >
        <div className="w-full flex justify-between items-center gap-2 p-4 bg-linear-to-b from-background to-transparent">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
            <div className="flex shrink-0 items-center justify-start gap-1">
              <Skeleton className="size-[18px] shrink-0 rounded-sm" />
              <Skeleton className="h-8 w-14 shrink-0" />
            </div>
            <Skeleton className="h-3.5 w-2 shrink-0" />
            <Skeleton className="h-8 w-28 max-w-full shrink" />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
        </div>
      </header>
      <div className="wrapper-private flex flex-1 flex-col items-center justify-start gap-0 pt-24 pb-4 min-h-0 w-full">
        <div className="flex-1 flex flex-col items-stretch justify-start gap-2 min-h-0 w-full">
          <div className="flex-1 w-full h-20 p-4 pb-0 overflow-hidden">
            <div className="flex w-full min-w-0 flex-col items-stretch justify-start gap-4 h-full">
              {SKELETON_ROWS.map((row, i) => (
                <div key={i} className="flex items-start gap-2 w-full">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    {row.lines.map((w, j) => (
                      <Skeleton key={j} className={`h-3.5 ${w}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="w-full shrink-0 md:p-4 md:pt-0">
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      </div>
    </>
  );
}
