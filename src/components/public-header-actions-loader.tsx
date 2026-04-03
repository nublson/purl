"use client";

import nextDynamic from "next/dynamic";
import { Suspense } from "react";
import { HeaderActionsFallback } from "@/components/skeletons";

const HeaderActions = nextDynamic(
  () => import("@/components/header-actions"),
  {
    ssr: false,
    loading: () => <HeaderActionsFallback />,
  },
);

export function PublicHeaderActions() {
  return (
    <Suspense fallback={<HeaderActionsFallback />}>
      <HeaderActions />
    </Suspense>
  );
}
