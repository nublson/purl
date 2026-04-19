import { Skeleton } from "@/components/ui/skeleton";

export function HomeLinksFallback() {
  return (
    <div className="space-y-4 w-full">
      <Skeleton className="h-4 w-8" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full py-2" />
        ))}
      </div>
    </div>
  );
}
