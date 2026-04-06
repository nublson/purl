import { ScrollArea } from "../ui/scroll-area";
import { ChatEmpty } from "./chat-empty";
import ChatMessage from "./chat-message";

interface Message {
  id: number;
  content: string;
  sender: "user" | "assistant";
}

const messages: Message[] = [];

export default function ChatArea() {
  if (messages.length === 0) {
    return <ChatEmpty />;
  }

  return (
    <ScrollArea className="flex-1 w-full h-full p-4 pb-0 overflow-hidden">
      <div className="flex flex-col items-center justify-start gap-4 h-full">
        {messages.map((message) => (
          <ChatMessage key={message.id} {...message} />
        ))}
      </div>
    </ScrollArea>
  );
}
