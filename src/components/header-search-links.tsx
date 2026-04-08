"use client";

import type { Link } from "@/utils/links";
import dynamic from "next/dynamic";

const SearchLinks = dynamic(() => import("@/components/search-links"), {
  ssr: false,
  loading: () => (
    <div
      className="inline-flex h-9 min-w-30 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground"
      aria-hidden
    >
      Search
    </div>
  ),
});

export function HeaderSearchLinks({ links }: { links: Link[] }) {
  return <SearchLinks links={links} />;
}
