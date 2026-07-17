import { MessageCircle } from "lucide-react";
import { Button } from "../ui/button";

interface ChatItemProps extends React.ComponentProps<typeof Button> {
  title: string;
  icon?: React.ReactNode;
}

export default function ChatItem({ title, icon, ...props }: ChatItemProps) {
  return (
    <Button
      variant="ghost"
      className="w-full min-w-0 justify-start cursor-pointer text-muted-foreground hover:text-accent-foreground"
      {...props}
    >
      <span className="shrink-0">
        {icon || <MessageCircle className="size-4" />}
      </span>
      <span className="truncate">{title}</span>
    </Button>
  );
}
