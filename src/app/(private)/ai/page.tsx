"use client";

import ChatInput from "@/components/chat/chat-input";
import ChatItem from "@/components/chat/chat-item";
import ChatItemGroup from "@/components/chat/chat-item-group";
import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";
import { Brain, CalendarDays } from "lucide-react";

export default function AiPage() {
  return (
    <div className="wrapper-private flex flex-1 flex-col items-center justify-center gap-0 pt-24 pb-32">
      <div className="flex flex-col items-center justify-center gap-4 mb-8">
        <Logo size={64} />
        <Typography component="h2" variant="h2">
          What magic shall we make happen?
        </Typography>
      </div>
      <ChatInput
        input=""
        onInputChange={(value) => {
          console.log(value);
        }}
        onSubmit={(e) => {
          e?.preventDefault();
          e?.stopPropagation();
          console.log("submit");
        }}
        isLoading={false}
        className="min-h-16"
      />
      <div className="w-full flex items-start justify-between gap-4 px-4 pt-14">
        <ChatItemGroup title="Recent chats">
          <ChatItem title="Updates in Purl AI" />
          <ChatItem title="Summarize of last two weeks" />
        </ChatItemGroup>

        <ChatItemGroup title="Suggested">
          <ChatItem
            title="Recap everything I read this week"
            icon={<Brain className="size-4" />}
          />
          <ChatItem
            title="Analyze my reading habits this month"
            icon={<CalendarDays className="size-4" />}
          />
        </ChatItemGroup>
      </div>
    </div>
  );
}
