"use client";

import { cn } from "@/lib/utils";
import { sanitizeChatMarkdownHref } from "@/utils/safe-markdown-href";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography } from "../typography";

export function ChatMarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // F-004: never pass raw model-provided href — block javascript:/data:/etc.
        a: (anchorProps) => {
          const { href, children, node, ...props } = anchorProps;
          void node; // MDAST node from react-markdown must not be forwarded to the DOM
          const safe = sanitizeChatMarkdownHref(
            typeof href === "string" ? href : undefined,
          );
          if (!safe) {
            return (
              <span
                className={cn(
                  "text-muted-foreground underline underline-offset-2",
                  props.className,
                )}
              >
                {children}
              </span>
            );
          }
          return (
            <a
              {...props}
              href={safe}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("underline underline-offset-2", props.className)}
            >
              {children}
            </a>
          );
        },
        p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
        ul: ({ ...props }) => (
          <ul className="mb-2 list-disc pl-5 last:mb-0" {...props} />
        ),
        ol: ({ ...props }) => (
          <ol className="mb-2 list-decimal pl-5 last:mb-0" {...props} />
        ),
        li: ({ ...props }) => <li className="mb-1" {...props} />,
        h1: ({ ...props }) => (
          <Typography
            component="h4"
            size="small"
            className="mb-2 font-semibold"
            {...props}
          />
        ),
        h2: ({ ...props }) => (
          <Typography
            component="h5"
            size="small"
            className="mb-2 font-semibold"
            {...props}
          />
        ),
        h3: ({ ...props }) => (
          <Typography
            component="h6"
            size="small"
            className="mb-2 font-semibold"
            {...props}
          />
        ),
        code: ({ className, ...props }) => (
          <code
            className={cn("rounded bg-muted px-1 py-0.5 text-xs", className)}
            {...props}
          />
        ),
        pre: ({ ...props }) => (
          <pre
            className="mb-2 overflow-x-auto rounded-md bg-muted p-2 text-xs last:mb-0"
            {...props}
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
