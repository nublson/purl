import ChatArea from "./chat-area";
import ChatHeader from "./chat-header";
import ChatInput from "./chat-input";

interface ChatConversationProps {
  onClose: () => void;
}

export default function ChatConversation({ onClose }: ChatConversationProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-start md:h-[463px] md:w-96">
      <ChatHeader onClose={onClose} />
      <ChatArea />
      <ChatInput />
    </div>
  );
}
