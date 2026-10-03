"use client";

import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { isApplePlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import * as React from "react";
import { Kbd } from "./ui/kbd";

/** Keys that focus the field from anywhere on the page. */
const FOCUS_KEY = "/";

/**
 * The search field pinned to the bottom of Home and folder pages. Typing
 * filters the list (the page owns the query); when the text is a URL
 * (`saveUrl`), Enter saves it instead. `/` or ⌘/Ctrl+K focuses it, Esc
 * clears it (and leaves it when already empty).
 */
export function LinkOmnibox({
  value,
  onChange,
  onSave,
  saveUrl,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Saves `saveUrl`; called on Enter when there is one. */
  onSave: () => void;
  saveUrl: string | null;
  placeholder: string;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [apple, setApple] = React.useState(false);
  React.useEffect(() => setApple(isApplePlatform()), []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const mod = event.metaKey || event.ctrlKey;
      const isFocusKey =
        (event.key === FOCUS_KEY && !mod && !event.altKey) ||
        (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k");
      if (!isFocusKey) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form
      role="search"
      className={cn(
        "fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mx-auto flex h-11 w-[calc(100%-2rem)] max-w-2xl items-center gap-2 rounded-xl bg-popover ps-3 pe-1.5 text-popover-foreground",
        // Same raised surface and layered shadow as the selection bar.
        "shadow-[0_0_0_1px_var(--border),0_2px_4px_-1px_oklch(0_0_0/0.12),0_8px_24px_-4px_oklch(0_0_0/0.24)]",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (saveUrl) onSave();
        else inputRef.current?.blur();
      }}
    >
      <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        // "Go" on phone keyboards: Enter saves a URL or ends the search.
        enterKeyHint={saveUrl ? "go" : "search"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Search your links or paste a link to save"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          if (value) onChange("");
          else event.currentTarget.blur();
        }}
        // 16px text: iOS zooms the page into smaller inputs.
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <X className="size-4" />
        </button>
      ) : (
        <Kbd
          aria-hidden="true"
          className="me-1.5 hidden [@media(hover:hover)]:inline-flex"
        >
          {apple ? "⌘K" : "Ctrl+K"}
        </Kbd>
      )}
    </form>
  );
}
