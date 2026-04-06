import { ScrollArea } from "../ui/scroll-area";
import ChatMessage from "./chat-message";

interface Message {
  id: number;
  content: string;
  sender: "user" | "assistant";
}

const messages: Message[] = [
  {
    id: 3,
    content: "Recap everything I read this week",
    sender: "user",
  },
  {
    id: 4,
    content:
      "AI Chat is a Pro feature. Upgrade to search, save, and manage your links with natural language.",
    sender: "assistant",
  },
];

export default function ChatArea() {
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
