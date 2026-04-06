"use client";

import { useChatContext } from "@/contexts/chat-context";
import { ArrowUp } from "lucide-react";
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
}

export default function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
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
    <form onSubmit={onSubmit} className="w-full p-4">
      <InputGroup className="w-full dark:bg-input/30 items-end">
        {mentions.length > 0 && (
          <InputGroupAddon
            align="block-start"
            className="flex items-center justify-start no-scrollbar gap-1 overflow-x-auto overflow-y-hidden"
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
          className="min-h-11 max-h-24 no-scrollbar"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <InputGroupAddon align="inline-end" className="justify-end gap-2">
          <div className="shrink-0">
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
