import { cn } from "@/lib/utils";
import { Typography } from "./typography";

/**
 * A folder's emoji in the same 16px box as an icon, so emoji rows and
 * icon rows share one leading edge and one text start. Sized optically, not
 * geometrically: the icons' drawn shapes fill ~12–14px of their 16px box while
 * an emoji fills nearly its whole em, so 14px (`text-sm`) matches the icons'
 * visual weight where 16px reads a size larger. `leading-none` in a centered
 * box keeps the glyph on the text's optical center. Decorative: the folder
 * name carries the meaning.
 */
export function FolderEmoji({
  emoji,
  className,
}: {
  emoji: string;
  className?: string;
}) {
  return (
    <Typography
      component="span"
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-sm leading-none",
        className,
      )}
    >
      {emoji}
    </Typography>
  );
}
