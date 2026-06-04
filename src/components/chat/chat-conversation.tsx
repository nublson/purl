"use client";

import { useChatConversation } from "@/hooks/use-chat-conversation";
import ChatArea from "./chat-area";
import ChatHeader from "./chat-header";
import ChatInput from "./chat-input";

interface ChatConversationProps {
  onClose: () => void;
}

export default function ChatConversation({ onClose }: ChatConversationProps) {
  const {
    messages,
    input,
    setInput,
    messageMentions,
    isLoading,
    isLoadingChat,
    chatTitle,
    flowError,
    sessionUser,
    handleSubmit,
    handleSuggestion,
    handleNewChat,
    handleSelectChat,
    handleRetrySend,
  } = useChatConversation();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-start">
      <ChatHeader
        title={chatTitle}
        onClose={onClose}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        isLoadingChat={isLoadingChat}
      />
      <ChatArea
        messages={messages}
        messageMentions={messageMentions}
        isLoading={isLoading}
        isLoadingChat={isLoadingChat}
        onSuggestion={handleSuggestion}
        userAvatarUrl={sessionUser?.image}
        userDisplayName={sessionUser?.name}
        flowError={flowError}
        onRetrySend={handleRetrySend}
      />
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
