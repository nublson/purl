"use client";

import type { Link } from "@/utils/links";
import dynamic from "next/dynamic";
import { Skeleton } from "./ui/skeleton";

const SearchLinks = dynamic(() => import("@/components/search-links"), {
  ssr: false,
  loading: () => <Skeleton className="h-8 w-8 rounded-md" />,
});

export function HeaderSearchLinks({ links }: { links: Link[] }) {
  return <SearchLinks links={links} />;
}
