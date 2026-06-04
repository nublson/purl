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
      className="w-full justify-start cursor-pointer"
      {...props}
    >
      {icon || <MessageCircle className="size-4" />}
      {title}
    </Button>
  );
}
