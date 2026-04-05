"use client";

import {
  filterLinksForMentionQuery,
  formatMentionToken,
} from "@/lib/chat-utils";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { ArrowUp } from "lucide-react";
import * as React from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { MentionList } from "./mention-list";

function splitInputByMentions(
  value: string,
): Array<{ type: "text"; text: string } | { type: "mention"; title: string }> {
  const re = /@\[([^\]]*)\]\(([^)]+)\)/g;
  const out: Array<
    { type: "text"; text: string } | { type: "mention"; title: string }
  > = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", text: value.slice(last, m.index) });
    }
    out.push({ type: "mention", title: m[1]?.trim() || "Link" });
    last = m.index + m[0].length;
  }
  if (last < value.length) {
    out.push({ type: "text", text: value.slice(last) });
  }
  return out;
}

function MentionMirror({ value }: { value: string }) {
  const segments = splitInputByMentions(value);
  if (segments.length === 0) {
    return <span className="text-foreground">{"\u00a0"}</span>;
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i} className="text-foreground">
            {seg.text}
          </span>
        ) : (
          <span
            key={i}
            className="mx-0.5 inline align-baseline rounded-md bg-primary/20 px-1.5 py-px text-primary [text-decoration:none] first:ml-0"
          >
            @{seg.title}
          </span>
        ),
      )}
    </>
  );
}

function getMentionState(
  value: string,
  cursor: number,
): { open: boolean; query: string; start: number } {
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return { open: false, query: "", start: -1 };
  const afterAt = before.slice(at + 1);
  if (afterAt.includes(" ") || afterAt.includes("\n")) {
    return { open: false, query: "", start: -1 };
  }
  return { open: true, query: afterAt, start: at };
}

/**
 * Viewport rect for the character at `index` in `textarea`, aligned to the
 * textarea's content box (for anchoring the mention popover to `@`).
 */
function getCaretRect(
  textarea: HTMLTextAreaElement,
  index: number,
): DOMRect | null {
  const cs = getComputedStyle(textarea);
  const taRect = textarea.getBoundingClientRect();
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;

  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.left = `${taRect.left + bl}px`;
  div.style.top = `${taRect.top + bt}px`;
  div.style.width = `${textarea.clientWidth}px`;
  div.style.boxSizing = cs.boxSizing;
  div.style.padding = cs.padding;
  div.style.fontFamily = cs.fontFamily;
  div.style.fontSize = cs.fontSize;
  div.style.fontWeight = cs.fontWeight;
  div.style.fontStyle = cs.fontStyle;
  div.style.lineHeight = cs.lineHeight;
  div.style.letterSpacing = cs.letterSpacing;
  div.style.whiteSpace = "pre-wrap";
  div.style.wordBreak = cs.wordBreak;
  div.style.overflowWrap = cs.overflowWrap as string;
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  div.style.zIndex = "-1";

  const text = textarea.value;
  const safeIndex = Math.min(Math.max(0, index), text.length);
  const before = document.createTextNode(text.slice(0, safeIndex));
  const span = document.createElement("span");
  span.textContent = text[safeIndex] ?? "\u200b";
  const after = document.createTextNode(text.slice(safeIndex + 1));

  div.appendChild(before);
  div.appendChild(span);
  div.appendChild(after);

  document.body.appendChild(div);
  const rect = span.getBoundingClientRect();
  document.body.removeChild(div);

  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

export function ChatInput({
  links,
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Ask about your links...",
  className,
}: {
  links: Link[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const mirrorRef = React.useRef<HTMLDivElement>(null);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionStart, setMentionStart] = React.useState(-1);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  const syncMention = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const state = getMentionState(value, cursor);
    setMentionOpen(state.open);
    setMentionQuery(state.query);
    setMentionStart(state.start);
  }, [value]);

  React.useEffect(() => {
    if (!mentionOpen) setHighlightedIndex(0);
  }, [mentionOpen, mentionQuery]);

  const filtered = React.useMemo(
    () => filterLinksForMentionQuery(links, mentionQuery),
    [links, mentionQuery],
  );

  React.useEffect(() => {
    setHighlightedIndex((i) =>
      filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1),
    );
  }, [filtered.length]);

  const updateAnchorRect = React.useCallback(() => {
    const el = textareaRef.current;
    if (!mentionOpen || mentionStart < 0 || !el) {
      setAnchorRect(null);
      return;
    }
    setAnchorRect(getCaretRect(el, mentionStart));
  }, [mentionOpen, mentionStart]);

  React.useLayoutEffect(() => {
    updateAnchorRect();
  }, [updateAnchorRect, value]);

  React.useEffect(() => {
    if (!mentionOpen) {
      setAnchorRect(null);
      return;
    }
    updateAnchorRect();
    const onResize = () => updateAnchorRect();
    window.addEventListener("resize", onResize);
    const ta = textareaRef.current;
    ta?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      ta?.removeEventListener("scroll", onResize);
    };
  }, [mentionOpen, updateAnchorRect]);

  const insertMention = React.useCallback(
    (link: Link) => {
      if (mentionStart < 0) return;
      const el = textareaRef.current;
      const cursor = el?.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursor);
      const token = `${formatMentionToken(link)} `;
      const next = `${before}${token}${after}`;
      onChange(next);
      setMentionOpen(false);
      setAnchorRect(null);
      queueMicrotask(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        const pos = before.length + token.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [mentionStart, onChange, value],
  );

  const syncScroll = React.useCallback(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (ta && mirror) {
      mirror.scrollTop = ta.scrollTop;
    }
    if (mentionOpen) {
      queueMicrotask(() => updateAnchorRect());
    }
  }, [mentionOpen, updateAnchorRect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(filtered[highlightedIndex]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        setAnchorRect(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <MentionList
        links={links}
        query={mentionQuery}
        open={mentionOpen && links.length > 0}
        anchorRect={anchorRect}
        onSelect={insertMention}
        highlightedIndex={highlightedIndex}
        onHighlightChange={setHighlightedIndex}
      />
      <div className="flex flex-col gap-3 rounded-xl border bg-background p-3 shadow-sm">
        <div className="relative min-h-[5.5rem] w-full">
          {value ? (
            <div
              ref={mirrorRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap wrap-break-word px-0.5 py-0.5 text-base leading-relaxed md:text-sm"
            >
              <MentionMirror value={value} />
            </div>
          ) : null}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              queueMicrotask(() => {
                syncMention();
                syncScroll();
              });
            }}
            onScroll={syncScroll}
            onSelect={syncMention}
            onKeyUp={syncMention}
            onClick={syncMention}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            className={cn(
              "relative z-10 min-h-[5.5rem] max-h-40 w-full resize-none border-0 bg-transparent px-0.5 py-0.5 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-sm",
              value
                ? "text-transparent caret-foreground selection:bg-primary/25"
                : "",
            )}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="icon"
            disabled={disabled || !value.trim()}
            onClick={onSubmit}
            aria-label="Send message"
            className="size-9 shrink-0 rounded-full"
          >
            <ArrowUp data-icon="inline-start" />
          </Button>
        </div>
      </div>
    </div>
  );
}
