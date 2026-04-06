import { cn } from "@/lib/utils";
import Image from "next/image";
import { Typography } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Item, ItemContent, ItemMedia, ItemTitle } from "../ui/item";

interface Message {
  id: number;
  content: string;
  sender: "user" | "assistant";
}

export default function ChatMessage({ content, sender }: Message) {
  const media =
    sender === "user" ? (
      <Avatar className="size-5">
        <AvatarImage src="https://github.com/nublson.png" />
        <AvatarFallback>N</AvatarFallback>
      </Avatar>
    ) : (
      <Image src="/logo.svg" alt="Purl" width={20} height={20} priority />
    );

  return (
    <Item className="p-0 gap-2 items-start">
      <ItemMedia>{media}</ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Typography
            size="small"
            className={cn(
              sender === "user"
                ? "text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            {content}
          </Typography>
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
