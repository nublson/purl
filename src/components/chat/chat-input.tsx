"use client";

import { useChatContext } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { ArrowUp, AtSign, Mic } from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { Button } from "../ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "../ui/input-group";
import ChatMention from "./chat-mention";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isLoading: boolean;
  className?: string;
}

export default function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  className,
}: ChatInputProps) {
  const { mentions, removeMention } = useChatContext();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  return (
    <form onSubmit={onSubmit} className="w-full sm:p-0 md:p-4 md:pt-0">
      <InputGroup className="w-full h-full dark:bg-input/30 items-end">
        {mentions.length > 0 && (
          <InputGroupAddon
            align="block-start"
            className="flex items-center justify-start gap-1 no-scrollbar overflow-x-auto overflow-y-hidden"
          >
            {mentions.map((link) => (
              <ChatMention
                key={link.id}
                link={link}
                onRemove={() => removeMention(link.id)}
              />
            ))}
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          placeholder="Enter your message"
          className={cn("min-h-11 max-h-24 no-scrollbar", className)}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <InputGroupAddon align="block-end" className="justify-between gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="cursor-pointer rounded-full"
            disabled
          >
            <AtSign />
          </Button>
          <div className="shrink-0 flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="cursor-pointer rounded-full"
              disabled
            >
              <Mic />
            </Button>
            <Button
              type="submit"
              size="icon-sm"
              variant="default"
              className="cursor-pointer rounded-full"
              disabled={isLoading || !input.trim()}
            >
              <ArrowUp />
            </Button>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
