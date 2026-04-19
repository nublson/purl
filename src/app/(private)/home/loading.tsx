import { HomeLinksFallback } from "./home-links-fallback";

export default function HomeLoading() {
  return (
    <div className="flex min-h-[200px] w-full flex-1 flex-col items-center justify-start gap-8">
      <HomeLinksFallback />
    </div>
  );
}
