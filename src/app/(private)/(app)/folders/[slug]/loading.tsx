import { LinkViewFrame } from "@/components/link-view-frame";
import { HomeSkeleton } from "@/components/skeletons/home";

/**
 * Shown while the folder is looked up. Same wrapper and skeleton as the
 * page's own Suspense fallback, so the skeleton stays put when the page
 * takes over. (Home needs none: its page renders right away and its
 * fallback covers the wait.)
 */
export default function FolderLoading() {
  return (
    <LinkViewFrame>
      <HomeSkeleton />
    </LinkViewFrame>
  );
}
