import {
  SHARED_GRID_COLUMNS,
  type SharedFolderView,
} from "@/lib/shared-folder-view";
import { cn } from "@/lib/utils";
import { Typography } from "./typography";

/**
 * A shared folder's description, one muted line above its links, lined up
 * with what's below it: the rows' text inset (8px) in the list, the first
 * card column in the grid (same columns, spanning them all). Rendered by
 * both the list and its loading skeleton, so nothing shifts when the links
 * arrive.
 */
export function SharedFolderDescription({
  description,
  view,
}: {
  description: string | null;
  view: SharedFolderView;
}) {
  if (!description) return null;
  return view === "grid" ? (
    <div className={cn("mb-6 grid w-full", SHARED_GRID_COLUMNS)}>
      <Typography component="p" size="small" className="col-span-full">
        {description}
      </Typography>
    </div>
  ) : (
    <Typography component="p" size="small" className="mb-6 px-2">
      {description}
    </Typography>
  );
}
