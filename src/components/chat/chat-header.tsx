import { History, Plus, X } from "lucide-react";
import { Typography } from "../typography";
import { Button } from "../ui/button";

interface ChatHeaderProps {
  onClose: () => void;
}

export default function ChatHeader({ onClose }: ChatHeaderProps) {
  return (
    <header className="w-full flex items-center justify-between gap-4 px-4 py-2 border-b border-border">
      <Typography
        component="h3"
        size="small"
        className="text-accent-foreground font-medium line-clamp-1"
      >
        New chat
      </Typography>
      <div className="flex items-center justify-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer text-muted-foreground"
        >
          <History />
        </Button>
        <Button size="icon-sm" variant="ghost" className="cursor-pointer">
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
