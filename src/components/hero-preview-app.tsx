"use client";

import { HeroPreviewAppSkeleton } from "@/components/skeletons";
import type { Link as LinkType } from "@/utils/links";
import { lazy, Suspense } from "react";

const PreviewApp = lazy(() => import("@/components/preview-app"));

interface HeroPreviewAppProps {
  urls: string[];
  defaultUrls: LinkType[];
}

export function HeroPreviewApp({ urls, defaultUrls }: HeroPreviewAppProps) {
  return (
    <Suspense fallback={<HeroPreviewAppSkeleton />}>
      <PreviewApp urls={urls} defaultUrls={defaultUrls} />
    </Suspense>
  );
}
