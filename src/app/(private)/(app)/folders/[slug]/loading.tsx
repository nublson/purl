import { HomeSkeleton } from "@/components/skeletons/home";

/**
 * Shown while the folder is looked up. Same wrapper and skeleton as the
 * page's own Suspense fallback, so the skeleton stays put when the page
 * takes over. (Home needs none: its page renders right away and its
 * fallback covers the wait.)
 */
export default function FolderLoading() {
  return (
    <div className="wrapper-private flex flex-1 flex-col gap-8 pt-24 pb-36">
      <HomeSkeleton />
    </div>
  );
}
