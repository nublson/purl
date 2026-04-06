import ChatArea from "./chat-area";
import ChatHeader from "./chat-header";
import ChatInput from "./chat-input";

export default function ChatConversation() {
  return (
    <div className="w-96 h-[417px] flex flex-col items-center justify-start relative">
      <ChatHeader />
      <ChatArea />
      <ChatInput />
    </div>
  );
}
