import { Spinner } from "@/components/ui/spinner";

export default function HomeLoading() {
  return (
    <div className="wrapper flex-1 flex flex-col items-center justify-center gap-8 pb-32">
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}
