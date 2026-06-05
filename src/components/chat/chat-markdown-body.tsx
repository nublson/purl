"use client";

import { cn } from "@/lib/utils";
import { sanitizeChatMarkdownHref } from "@/utils/safe-markdown-href";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography } from "../typography";

const bodyText = "text-sm leading-6 text-foreground";
const blockSpacing = "mb-4 last:mb-0";
const nestedList =
  "[&_ol]:mb-0 [&_ol]:mt-0 [&_ol]:pl-5 [&_ul]:mb-0 [&_ul]:mt-0 [&_ul]:pl-5";

export function ChatMarkdownBody({ content }: { content: string }) {
  return (
    <div className={cn("min-w-0 wrap-anywhere", bodyText)}>
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
                className={cn(
                  "underline underline-offset-2 hover:opacity-80",
                  props.className,
                )}
              >
                {children}
              </a>
            );
          },
          p: ({ ...props }) => (
            <Typography className={cn(bodyText, blockSpacing)} {...props} />
          ),
          ul: ({ ...props }) => (
            <ul
              className={cn("list-disc pl-5", blockSpacing, nestedList)}
              {...props}
            />
          ),
          ol: ({ ...props }) => (
            <ol
              className={cn("list-decimal pl-5", blockSpacing, nestedList)}
              {...props}
            />
          ),
          li: ({ ...props }) => (
            <li className={cn(bodyText, "mb-0 [&>p]:mb-0")} {...props} />
          ),
          h1: ({ ...props }) => (
            <Typography
              component="h1"
              className={cn(
                "text-2xl font-semibold leading-6 text-foreground",
                blockSpacing,
              )}
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <Typography
              component="h2"
              className={cn(
                "text-xl font-semibold leading-6 text-foreground",
                blockSpacing,
              )}
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <Typography
              component="h3"
              className={cn(bodyText, "text-lg font-semibold", blockSpacing)}
              {...props}
            />
          ),
          h4: ({ ...props }) => (
            <Typography
              component="h4"
              className={cn(bodyText, "text-base font-semibold", blockSpacing)}
              {...props}
            />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold leading-6" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote
              className={cn(
                "border-l-2 border-border pl-4 text-muted-foreground",
                blockSpacing,
              )}
              {...props}
            />
          ),
          hr: ({ ...props }) => (
            <hr
              className="my-4 border-0 border-t border-border"
              {...props}
            />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code className={cn("text-sm", className)} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className={cn(
                  "rounded bg-muted px-1 py-0.5 font-mono text-sm",
                  className,
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ ...props }) => (
            <pre
              className={cn(
                "overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm",
                blockSpacing,
              )}
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
