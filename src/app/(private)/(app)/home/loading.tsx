import { HomeSkeleton } from "@/components/skeletons/home";

export default function HomeLoading() {
  return (
    <div className="wrapper-private flex min-h-[200px] flex-1 flex-col items-center justify-start gap-8">
      <HomeSkeleton />
    </div>
  );
}
