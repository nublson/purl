import { Link } from "@/utils/links";
import { Badge } from "../ui/badge";

interface ChatBadgeProps {
  link: Link;
}

export default function ChatBadge({ link }: ChatBadgeProps) {
  return (
    <Badge variant="outline" asChild>
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        @{link.title}
      </a>
    </Badge>
  );
}
