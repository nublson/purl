import { LinkIcon } from "@/components/link-icon";
import { Link } from "@/utils/links";
import { X } from "lucide-react";
import { Typography } from "../typography";

interface ChatMentionProps {
  link: Link;
  onRemove?: () => void;
}

export default function ChatMention({ link, onRemove }: ChatMentionProps) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-36 max-w-64 rounded-full bg-muted px-2 py-1 overflow-hidden">
      <div className="flex items-center gap-1">
        <LinkIcon link={link} size="mini" />
        <Typography size="mini" className="w-full line-clamp-1 break-all">
          {link.title}
        </Typography>
      </div>
      {onRemove && (
        <X
          className="size-3 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={onRemove}
        />
      )}
    </div>
  );
}
