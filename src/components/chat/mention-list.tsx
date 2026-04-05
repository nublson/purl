"use client";

import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { FileMusic, FileText } from "lucide-react";
import Image from "next/image";
import * as React from "react";

function linkHaystack(link: Link): string {
  return [link.title, link.domain, link.url, link.description ?? ""]
    .join(" ")
    .toLowerCase();
}

export function MentionList({
  links,
  query,
  open,
  onSelect,
  highlightedIndex,
  onHighlightChange,
  className,
}: {
  links: Link[];
  query: string;
  open: boolean;
  onSelect: (link: Link) => void;
  highlightedIndex: number;
  onHighlightChange: (index: number) => void;
  className?: string;
}) {
  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return links;
    return links.filter((link) => linkHaystack(link).includes(q));
  }, [links, query]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 right-0 z-60 mb-2 max-h-52 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md",
        className,
      )}
      role="listbox"
      aria-label="Mention a saved link"
    >
      {filtered.length === 0 ? (
        <p className="px-3 py-2.5 text-sm text-muted-foreground">
          No matching links.
        </p>
      ) : (
        <ul className="p-1">
          {filtered.map((link, index) => (
            <li key={link.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none",
                  index === highlightedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
                onMouseEnter={() => onHighlightChange(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(link);
                }}
              >
                <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded">
                  {link.contentType === "PDF" ? (
                    <FileText className="size-4 text-muted-foreground" />
                  ) : link.contentType === "AUDIO" ? (
                    <FileMusic className="size-4 text-muted-foreground" />
                  ) : (
                    <Image
                      src={link.favicon}
                      alt=""
                      width={20}
                      height={20}
                      className="size-5 object-contain"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-medium">{link.title}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {link.domain}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
