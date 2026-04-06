"use client";

import { ChevronDown, MessageCircle } from "lucide-react";
import { useState } from "react";

import { useFullscreenRadixPopperOnMobile } from "@/hooks/use-fullscreen-radix-popper-on-mobile";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import ChatConversation from "./chat-conversation";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const popoverContentRef = useFullscreenRadixPopperOnMobile(open);

  const handleClose = () => {
    setOpen(false);
  };

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
      <PopoverContent
        ref={popoverContentRef}
        side="top"
        align="end"
        className={cn(
          "flex min-h-0 flex-col gap-0 p-0",
          "w-72 md:w-96",
          "max-md:h-dvh max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none max-md:ring-0",
        )}
      >
        <ChatConversation onClose={handleClose} />
      </PopoverContent>
    </Popover>
  );
}
