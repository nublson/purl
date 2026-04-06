import { Link } from "@/utils/links";
import { FileText, Globe, Headphones, TvMinimalPlay, X } from "lucide-react";
import { Button } from "../ui/button";

interface ChatMentionProps {
  link: Link;
  onRemove: () => void;
}

export default function ChatMention({ link, onRemove }: ChatMentionProps) {
  const badgeIcon = () => {
    switch (link.contentType) {
      case "WEB":
        return <Globe />;
      case "YOUTUBE":
        return <TvMinimalPlay />;
      case "PDF":
        return <FileText />;
      case "AUDIO":
        return <Headphones />;
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="cursor-pointer"
      onClick={onRemove}
    >
      {badgeIcon()}
      {link.title}
      <X />
    </Button>
  );
}
