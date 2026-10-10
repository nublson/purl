import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";

/** The pearl and the "Purl" wordmark. The wordmark names the product, so the pearl is decorative. */
export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex">
        <Logo size={24} />
      </span>
      <Typography
        component="span"
        className="text-lg font-semibold tracking-[-0.01em] text-foreground"
      >
        Purl
      </Typography>
    </div>
  );
}
