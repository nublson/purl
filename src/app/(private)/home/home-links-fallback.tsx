import { Spinner } from "@/components/ui/spinner";

export function HomeLinksFallback() {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-8">
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}
