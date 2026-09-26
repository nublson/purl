import { HomeSkeleton } from "@/components/skeletons/home";
import { Suspense } from "react";
import { HomeShellLoader } from "./home-shell-loader";

export default function Home() {
  return (
    <div className="wrapper-private flex flex-1 flex-col gap-8 pt-24 pb-20">
      <h1 className="sr-only">Saved links</h1>
      <p className="sr-only">Paste a link anywhere on this page to save it.</p>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeShellLoader />
      </Suspense>
    </div>
  );
}
