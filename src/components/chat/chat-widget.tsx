"use client";

import { useChatContext } from "@/contexts/chat-context";
import { useFullscreenRadixPopperOnMobile } from "@/hooks/use-fullscreen-radix-popper-on-mobile";
import { cn } from "@/lib/utils";
import { ChevronDown, MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import ChatConversation from "./chat-conversation";

export default function ChatWidget() {
  const { isWidgetOpen, setIsWidgetOpen } = useChatContext();
  const popoverContentRef = useFullscreenRadixPopperOnMobile(isWidgetOpen);

  const handleOpenChange = (open: boolean) => {
    setIsWidgetOpen(open);
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  return (
    <Popover open={isWidgetOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Open chat"
          size="icon-lg"
          variant="default"
          className={cn("cursor-pointer rounded-full")}
        >
          {isWidgetOpen ? <ChevronDown /> : <MessageCircle />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={popoverContentRef}
        side="top"
        align="end"
        className={cn(
          "flex min-h-0 flex-col gap-0 overflow-hidden p-0",
          "w-72 md:h-[80dvh] md:max-h-[500px] md:w-[450px]",
          "max-md:h-dvh max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none max-md:ring-0",
        )}
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("[data-add-to-chat]")
          ) {
            event.preventDefault();
          }
        }}
      >
        <ChatConversation onClose={handleClose} />
      </PopoverContent>
    </Popover>
  );
}
