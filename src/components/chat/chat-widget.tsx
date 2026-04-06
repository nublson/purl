"use client";

import { ChevronDown, MessageCircle } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import ChatConversation from "./chat-conversation";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon-lg"
          variant="default"
          className={cn("cursor-pointer rounded-full")}
        >
          {open ? <ChevronDown /> : <MessageCircle />}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="p-0 w-full h-full">
        <ChatConversation />
      </PopoverContent>
    </Popover>
  );
}
