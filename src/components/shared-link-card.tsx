import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import { LINK_PREVIEW_CARD_SURFACE, LinkPreviewBody } from "./link-preview";

/**
 * A link in the shared folder's grid: the hover preview card (same box,
 * thumbnail, title and description), as a link that opens the page.
 */
export function SharedLinkCard({
  link,
  eagerThumbnail = false,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
}) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${link.title} (opens in new tab)`}
      data-cy="link-card"
      className={cn(
        LINK_PREVIEW_CARD_SURFACE,
        "h-full outline-none transition-[box-shadow] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring [@media(hover:hover)]:hover:ring-foreground/20",
      )}
    >
      <LinkPreviewBody
        link={link}
        eagerThumbnail={eagerThumbnail}
        // The PDF render needs the signed-in proxy; visitors get the
        // regular thumbnail (or favicon).
        pdfThumbnail={false}
      />
    </a>
  );
}
