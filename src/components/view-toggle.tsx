"use client";

import { useLinkView } from "@/contexts/link-view-context";
import type { LinkView } from "@/lib/link-view";
import { Grid, List3 } from "reicon-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const OPTIONS = [
  { value: "list", label: "List view", Icon: List3 },
  { value: "grid", label: "Grid view", Icon: Grid },
] as const;

/**
 * The header's List / Grid switch: two toggle buttons in one outlined
 * segmented control, the current view filled (`aria-pressed`). On phones, where the header is short of room
 * (a folder's name would shrink to its emoji), one button instead, showing
 * and naming the other view ("Switch to grid view"). Both are rendered and
 * CSS picks one (the `phone:` variant), so the server's HTML is right on
 * first paint. The app header's (`LinkViewToggle`) and the shared folder
 * page's share it.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: LinkView;
  onChange: (view: LinkView) => void;
}) {
  const other = OPTIONS.find((option) => option.value !== view)!;
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Switch to ${other.value} view`}
        className="hidden shrink-0 cursor-pointer phone:inline-flex"
        onClick={() => onChange(other.value)}
      >
        <other.Icon />
      </Button>
      {/* One segmented control, so the pair reads as a single switch
          among the header's icons: 32px tall like them (1px border, 2px
          in, 26px buttons), corners concentric (10px out, 7px in). */}
      <div
        role="group"
        aria-label="View"
        className="flex shrink-0 items-center gap-0.5 rounded-[10px] border border-border p-0.5 phone:hidden"
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = view === value;
          return (
            <Button
              key={value}
              variant={active ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={label}
              aria-pressed={active}
              data-cy={`link-view-${value}`}
              className={cn(
                "size-[26px] cursor-pointer rounded-[7px]",
                !active && "text-muted-foreground",
              )}
              onClick={() => onChange(value)}
            >
              <Icon />
            </Button>
          );
        })}
      </div>
    </>
  );
}

/**
 * The app header's view switch: how Home and folders show links, saved on
 * the account (`useLinkView`; the landing demo's is local state).
 */
export function LinkViewToggle() {
  const { view, setView } = useLinkView();
  return <ViewToggle view={view} onChange={setView} />;
}
