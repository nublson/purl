import { LinkContentTypeIcon } from "@/components/link-content-type-icon";
import { Link } from "@/utils/links";
import { X } from "lucide-react";
import { Button } from "../ui/button";

interface ChatMentionProps {
  link: Link;
  onRemove: () => void;
}

export default function ChatMention({ link, onRemove }: ChatMentionProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="cursor-pointer"
      onClick={onRemove}
    >
      <LinkContentTypeIcon contentType={link.contentType} />
      {link.title}
      <X />
    </Button>
  );
}
