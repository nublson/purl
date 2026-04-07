import { History, Plus, X } from "lucide-react";
import { Typography } from "../typography";
import { Button } from "../ui/button";

interface ChatHeaderProps {
  title: string | null;
  onClose: () => void;
  onNewChat: () => void;
}

export default function ChatHeader({
  title,
  onClose,
  onNewChat,
}: ChatHeaderProps) {
  const label = title && title.trim().length > 0 ? title.trim() : "New chat";

  return (
    <header className="w-full flex items-center justify-between gap-4 px-4 py-2 border-b border-border">
      <Typography
        component="h3"
        size="small"
        className="text-accent-foreground font-medium line-clamp-1"
      >
        {label}
      </Typography>
      <div className="flex items-center justify-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer text-muted-foreground"
        >
          <History />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer"
          onClick={onNewChat}
        >
          <Plus />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer md:hidden"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
    </header>
  );
}
