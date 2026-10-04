import { LinkViewFrame } from "@/components/link-view-frame";
import { HomeSkeleton } from "@/components/skeletons/home";
import { Suspense } from "react";
import { HomeShellLoader } from "./home-shell-loader";

export default function Home() {
  return (
    <LinkViewFrame>
      <h1 className="sr-only">Saved links</h1>
      <p className="sr-only">Paste a link anywhere on this page to save it.</p>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeShellLoader />
      </Suspense>
    </LinkViewFrame>
  );
}
