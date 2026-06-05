"use client";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatFlowError } from "@/lib/chat-flow-error";
import Image from "next/image";
import Link from "next/link";
import { RateLimitCountdown } from "./rate-limit-countdown";

interface ChatErrorMessageProps {
  error: ChatFlowError;
  onRetrySend?: () => void;
}

export function ChatErrorMessage({ error, onRetrySend }: ChatErrorMessageProps) {
  const body = (() => {
    switch (error.kind) {
      case "session":
        return (
          <div className="flex flex-col items-start gap-2">
            <Typography size="small" className="text-accent-foreground">
              Please sign in again.
            </Typography>
            <Button size="xs" variant="secondary" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        );
      case "missing_chat":
        return (
          <Typography size="small" className="text-accent-foreground">
            This chat is no longer available.
          </Typography>
        );
      case "rate_limit":
        return (
          <div className="flex flex-col items-start gap-2">
            <RateLimitCountdown untilMs={error.untilMs} />
          </div>
        );
      case "limit_reached":
        return (
          <div className="flex flex-col items-start gap-2">
            <Typography size="small" className="text-accent-foreground">
              {error.message}
            </Typography>
            <Button size="xs" variant="secondary" asChild>
              <Link href="/#pricing">Upgrade</Link>
            </Button>
          </div>
        );
      case "quota_exceeded":
        return (
          <div className="flex flex-col items-start gap-2">
            <Typography size="small" className="text-accent-foreground">
              Your OpenAI API key has run out of credits.
            </Typography>
            <Button size="xs" variant="secondary" asChild>
              <Link
                href="https://platform.openai.com/settings/organization/billing"
                target="_blank"
              >
                Add credits
              </Link>
            </Button>
          </div>
        );
      case "retry":
        return (
          <div className="flex flex-col items-start gap-2">
            <Typography size="small" className="text-accent-foreground">
              {error.message}
            </Typography>
            {onRetrySend ? (
              <Button size="xs" variant="secondary" onClick={onRetrySend}>
                Try again
              </Button>
            ) : null}
          </div>
        );
    }
  })();

  return (
    <Message
      className={cn(
        "min-w-0 w-full max-w-full flex-row items-start gap-2 p-0",
      )}
      from="assistant"
    >
      <div className="shrink-0">
        <Image src="/logo.svg" alt="Purl" width={20} height={20} priority />
      </div>
      <MessageContent
        className={cn(
          "min-w-0 w-full flex-1 gap-0",
          "group-[.is-assistant]:w-full",
        )}
      >
        <div className="line-clamp-none w-full min-w-0 max-w-full text-sm">
          {body}
        </div>
      </MessageContent>
    </Message>
  );
}
