"use client";

import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("@/components/chat/chat-widget"), {
  ssr: false,
  loading: () => (
    <Button
      size="icon-lg"
      variant="default"
      className="cursor-pointer rounded-full"
      aria-label="Open chat"
    >
      <MessageCircle />
    </Button>
  ),
});

export function HomeChatWidget() {
  const { preferences } = usePreferences();

  if (preferences.showChatWidget === false) {
    return null;
  }

  return (
    <div className="hidden md:block fixed bottom-4 right-4 md:bottom-8 md:right-8">
      <ChatWidget />
    </div>
  );
}
