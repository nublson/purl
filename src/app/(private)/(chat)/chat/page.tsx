"use client";

import ChatArea from "@/components/chat/chat-area";
import ChatInput from "@/components/chat/chat-input";
import HeaderChat from "@/components/header-chat";
import { useChatConversation } from "@/hooks/use-chat-conversation";

export default function ChatPage() {
  const {
    messages,
    input,
    setInput,
    messageMentions,
    isLoading,
    isLoadingChat,
    chatId,
    chatTitle,
    flowError,
    sessionUser,
    handleSubmit,
    handleSuggestion,
    handleNewChat,
    handleSelectChat,
    handleRenameChat,
    handleDeleteChat,
    handleRetrySend,
  } = useChatConversation();

  return (
    <>
      <HeaderChat
        title={chatTitle}
        chatId={chatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        isLoadingChat={isLoadingChat}
      />
      <div className="wrapper-private flex flex-1 flex-col items-center justify-start gap-0 pt-24 pb-4 min-h-0 w-full">
        <div className="flex-1 flex flex-col items-stretch justify-start gap-2 min-h-0 w-full">
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
        </div>
        <div className="w-full shrink-0">
          <ChatInput
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            className="min-h-16"
          />
        </div>
      </div>
    </>
  );
}
