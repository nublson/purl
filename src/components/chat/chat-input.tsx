"use client";

import { useChatContext } from "@/hooks/use-chat-context";
import { cn } from "@/lib/utils";
import { ArrowUp, Loader2, Mic, MicOff } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
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
  const [partialText, setPartialText] = useState("");
  const inputRef = useRef(input);
  useEffect(() => { inputRef.current = input; }, [input]);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => setPartialText(data.text),
    onCommittedTranscript: (data) => {
      const current = inputRef.current;
      onInputChange(current ? `${current} ${data.text}` : data.text);
      setPartialText("");
    },
  });

  const isListening =
    scribe.status === "connected" || scribe.status === "transcribing";
  const isConnecting = scribe.status === "connecting";

  const toggleDictation = useCallback(async () => {
    if (isListening) {
      scribe.disconnect();
      setPartialText("");
      return;
    }
    try {
      const res = await fetch("/api/scribe-token");
      if (!res.ok) throw new Error("Failed to get token");
      const { token } = await res.json();
      await scribe.connect({
        token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      console.error("Dictation error:", err);
      toast.error("Could not start dictation. Please try again.");
    }
  }, [isListening, scribe]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  const displayValue =
    isListening && partialText
      ? `${input}${input ? " " : ""}${partialText}`
      : input;

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
          placeholder={isListening ? "Listening…" : "Enter your message"}
          className={cn("min-h-11 max-h-24 no-scrollbar", className)}
          value={displayValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || isListening}
        />
        <InputGroupAddon align="block-end" className="justify-end gap-2">
          <div className="shrink-0 flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant={isListening ? "destructive" : "ghost"}
              className="cursor-pointer rounded-full"
              onClick={toggleDictation}
              disabled={isLoading || isConnecting}
              title={isListening ? "Stop dictation" : "Dictate message"}
            >
              {isConnecting ? (
                <Loader2 className="animate-spin" />
              ) : isListening ? (
                <MicOff />
              ) : (
                <Mic />
              )}
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
