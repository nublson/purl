"use client";

import ChatInput from "@/components/chat/chat-input";
import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";

export default function AiPage() {
  return (
    <div className="wrapper-private flex flex-1 flex-col items-center justify-center gap-8 pt-24 pb-32">
      <div className="flex flex-col items-center justify-center gap-4">
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
      />
    </div>
  );
}
