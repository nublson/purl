import { Typography } from "@/components/typography";
import { cn } from "@/lib/utils";

/**
 * The headline's signature word, drawn in the pearl gradient. It sits inside
 * the <h1>, so size and line height are inherited rather than Typography's
 * "regular" defaults; the gradient makes the text color transparent.
 */
function PearlWord({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <Typography
      component="span"
      data-pearl-word
      className={cn(
        "pearl-text text-[length:inherit] leading-[inherit]",
        className,
      )}
    >
      {children}
    </Typography>
  );
}

export { PearlWord };
