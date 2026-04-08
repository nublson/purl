"use client";

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography } from "../typography";

export function ChatMarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          />
        ),
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
