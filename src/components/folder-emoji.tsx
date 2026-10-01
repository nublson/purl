import { cn } from "@/lib/utils";
import { Typography } from "./typography";

/**
 * A folder's emoji in a fixed square box, so rows with emoji line up with
 * rows that use 16px lucide icons. Emoji glyphs render larger and lower than
 * text at the same font size; `leading-none` in a centered box keeps them on
 * the text's optical center. Decorative: the folder name carries the meaning.
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
        "flex size-4 shrink-0 items-center justify-center text-base leading-none",
        className,
      )}
    >
      {emoji}
    </Typography>
  );
}
