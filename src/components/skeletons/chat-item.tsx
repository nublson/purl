import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_WIDTHS = ["w-36", "w-44", "w-32", "w-40", "w-36"] as const;

interface ChatItemSkeletonProps {
  count?: number;
  widths?: readonly string[];
}

export function ChatItemSkeleton({
  count = 3,
  widths = DEFAULT_WIDTHS,
}: ChatItemSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex h-9 w-full items-center gap-1"
          aria-hidden
        >
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className={`h-3.5 ${widths[index % widths.length]}`} />
        </div>
      ))}
    </>
  );
}
