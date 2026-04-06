import { Link } from "@/utils/links";
import { FileText, Globe, Headphones, TvMinimalPlay, X } from "lucide-react";
import { Button } from "../ui/button";

interface ChatMentionProps {
  link: Link;
}

export default function ChatMention({ link }: ChatMentionProps) {
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
    <Button variant={"outline"} size={"xs"} className="cursor-pointer">
      {badgeIcon()}
      {link.title}
      <X />
    </Button>
  );
}
