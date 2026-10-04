"use client";

import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { isApplePlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import * as React from "react";
import { BOTTOM_BAR_BAND, OMNIBOX_SHELL } from "./omnibox-shell";
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
    <>
      {/* Rows scroll under the field: a band of page background (solid up to
          the field, then fading out above it, like the header's at the top)
          keeps them from showing below and around it. */}
      <div aria-hidden className={BOTTOM_BAR_BAND} />
      <form
        role="search"
        className={cn(
          // Same raised surface and layered shadow as the selection bar.
          OMNIBOX_SHELL,
          // Focused: the 1px edge takes the ring color (the input itself has
          // no outline). Only that shadow changes; nothing moves.
          "transition-[box-shadow] duration-150 ease-out-strong has-[input:focus-visible]:shadow-[0_0_0_1px_var(--ring),0_2px_4px_-1px_oklch(0_0_0/0.12),0_8px_24px_-4px_oklch(0_0_0/0.24)]",
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
        {/* ✕ (with text) and the ⌘K hint (empty) share one spot and
            cross-fade: opacity, scale and blur (opacity only with reduced
            motion). Both stay mounted; the hidden one is inert. */}
        <div className="grid shrink-0 place-items-center *:col-start-1 *:row-start-1">
          <button
            type="button"
            aria-label="Clear search"
            inert={!value}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-[opacity,scale,filter,color,background-color] duration-150 ease-out-strong hover:bg-accent hover:text-foreground",
              !value &&
                "pointer-events-none scale-25 opacity-0 blur-[4px] motion-reduce:scale-100 motion-reduce:blur-none",
            )}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
          <Kbd
            aria-hidden="true"
            className={cn(
              "me-1.5 hidden transition-[opacity,scale,filter] duration-150 ease-out-strong [@media(hover:hover)]:inline-flex",
              value &&
                "scale-25 opacity-0 blur-[4px] motion-reduce:scale-100 motion-reduce:blur-none",
            )}
          >
            {apple ? "⌘K" : "Ctrl+K"}
          </Kbd>
        </div>
      </form>
    </>
  );
}
