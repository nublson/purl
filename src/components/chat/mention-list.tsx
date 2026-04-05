"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { filterLinksForMentionQuery } from "@/lib/chat-utils";
import type { Link } from "@/utils/links";
import { FileMusic, FileText } from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { createPortal } from "react-dom";

const PANEL_WIDTH = 280;

export function MentionList({
  links,
  query,
  open,
  anchorRect,
  onSelect,
  highlightedIndex,
  onHighlightChange,
}: {
  links: Link[];
  query: string;
  open: boolean;
  anchorRect: DOMRect | null;
  onSelect: (link: Link) => void;
  highlightedIndex: number;
  onHighlightChange: (index: number) => void;
}) {
  const filtered = React.useMemo(
    () => filterLinksForMentionQuery(links, query),
    [links, query],
  );

  const selectedId = filtered[highlightedIndex]?.id ?? "";

  const panelStyle = React.useMemo((): React.CSSProperties | undefined => {
    if (!anchorRect || typeof window === "undefined") return undefined;
    const left = Math.min(
      anchorRect.left,
      window.innerWidth - PANEL_WIDTH - 16,
    );
    return {
      position: "fixed",
      left: Math.max(16, left),
      bottom: window.innerHeight - anchorRect.top + 8,
      width: PANEL_WIDTH,
      zIndex: 100,
      maxHeight: "min(13rem, 40vh)",
    };
  }, [anchorRect]);

  if (!open || typeof document === "undefined" || !anchorRect) return null;

  const panel = (
    <div
      className="flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={panelStyle}
      role="presentation"
      onMouseDown={(e) => e.preventDefault()}
    >
      <Command
        shouldFilter={false}
        value={selectedId}
        className="rounded-xl border-0 bg-transparent shadow-none"
      >
        <CommandInput
          aria-hidden
          tabIndex={-1}
          readOnly
          value={query}
          className="sr-only"
          wrapperClassName="sr-only size-0 overflow-hidden border-0 p-0"
        />
        <CommandList className="max-h-52">
          <CommandEmpty className="py-3 text-muted-foreground">
            No matching links.
          </CommandEmpty>
          <CommandGroup>
            {filtered.map((link, index) => (
              <CommandItem
                key={link.id}
                value={link.id}
                onMouseEnter={() => onHighlightChange(index)}
                onSelect={() => onSelect(link)}
              >
                <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded">
                  {link.contentType === "PDF" ? (
                    <FileText className="text-muted-foreground" />
                  ) : link.contentType === "AUDIO" ? (
                    <FileMusic className="text-muted-foreground" />
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
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );

  return createPortal(panel, document.body);
}
