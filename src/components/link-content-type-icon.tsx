import type { Link } from "@/utils/links";
import {
  FileText,
  Globe,
  Headphones,
  TvMinimalPlay,
  type LucideIcon,
} from "lucide-react";

type ContentType = Link["contentType"];

const contentTypeIcons = {
  WEB: Globe,
  YOUTUBE: TvMinimalPlay,
  PDF: FileText,
  AUDIO: Headphones,
} satisfies Record<ContentType, LucideIcon>;

export function LinkContentTypeIcon({
  contentType,
  className,
}: {
  contentType: ContentType;
  className?: string;
}) {
  const Icon = contentTypeIcons[contentType];
  return <Icon className={className} />;
}
