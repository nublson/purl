import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../ui/item";

interface ChatMessageProps {
  content: string;
  role: "user" | "assistant";
  isLoading?: boolean;
  mentions?: Link[];
}

export default function ChatMessage({
  content,
  role,
  isLoading,
  mentions,
}: ChatMessageProps) {
  const media =
    role === "user" ? (
      <Avatar className="size-5">
        <AvatarImage src="https://github.com/nublson.png" />
        <AvatarFallback>N</AvatarFallback>
      </Avatar>
    ) : (
      <Image src="/logo.svg" alt="Purl" width={20} height={20} priority />
    );

  return (
    <Item className="min-w-0 w-full p-0 gap-2 items-start">
      <ItemMedia>{media}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none w-full min-w-0 max-w-full">
          {isLoading && !content ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className={cn("min-w-0 max-w-full text-sm wrap-anywhere")}>
              {role === "assistant" ? (
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
                    p: ({ ...props }) => (
                      <p className="mb-2 last:mb-0" {...props} />
                    ),
                    ul: ({ ...props }) => (
                      <ul
                        className="mb-2 list-disc pl-5 last:mb-0"
                        {...props}
                      />
                    ),
                    ol: ({ ...props }) => (
                      <ol
                        className="mb-2 list-decimal pl-5 last:mb-0"
                        {...props}
                      />
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
                        className={cn(
                          "rounded bg-muted px-1 py-0.5 text-xs",
                          className,
                        )}
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
              ) : (
                <Typography
                  size="small"
                  className="text-accent-foreground wrap-anywhere"
                >
                  {content}
                </Typography>
              )}
            </div>
          )}
        </ItemTitle>
        {role === "user" && mentions && mentions.length > 0 && (
          <ItemDescription className="text-xs">
            {mentions.map((link, index) => (
              <span key={link.id}>
                {index > 0 ? ", " : ""}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  @{link.title}
                </a>
              </span>
            ))}
          </ItemDescription>
        )}
      </ItemContent>
    </Item>
  );
}
