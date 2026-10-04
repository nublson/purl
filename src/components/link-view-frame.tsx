"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { LINK_GRID_FRAME } from "@/lib/link-view";
import { cn } from "@/lib/utils";

/**
 * Home's and a folder's page frame, in the owner's view: the list's
 * column, or wide enough for four cards. Client-side, so switching the
 * view in the user menu resizes it at once.
 */
export function LinkViewFrame({ children }: { children: React.ReactNode }) {
  const { view } = useLinkView();
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-8 pt-24 pb-36",
        view === "grid" ? LINK_GRID_FRAME : "wrapper-private",
      )}
    >
      {children}
    </div>
  );
}
