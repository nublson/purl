import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { Link } from "@/utils/links";
import Image from "next/image";
import { PdfThumbnail } from "./pdf-thumbnail";

type LinkPreviewProps = {
  children: React.ReactNode;
  link: Link;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function LinkPreview({
  children,
  link,
  open,
  onOpenChange,
}: LinkPreviewProps) {
  return (
    <HoverCard
      open={open}
      onOpenChange={onOpenChange}
      openDelay={10}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="p-0 flex-col">
        {link.contentType === "PDF" ? (
          <PdfThumbnail url={link.url} />
        ) : link.thumbnail ? (
          <Image
            src={link.thumbnail}
            alt={link.title}
            width={200}
            height={200}
            className="w-full h-full object-cover aspect-video rounded-t-md"
          />
        ) : null}
        <div className="p-4 flex flex-col gap-2">
          <p className="text-accent-foreground text-sm font-medium line-clamp-2">
            {link.title}
          </p>
          {link.description && (
            <p className="text-muted-foreground text-xs font-normal line-clamp-3 break-all">
              {link.description}
            </p>
          )}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 text-xs font-normal line-clamp-1 break-all underline"
          >
            {link.url}
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
