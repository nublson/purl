"use client";

import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { UPLOAD_SHORTCUT } from "@/lib/upload-picker";
import { cn } from "@/lib/utils";
import { Paperclip, Search, X } from "reicon-react";
import * as React from "react";
import { BOTTOM_BAR_BAND, OMNIBOX_SHELL } from "./omnibox-shell";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** The field's end buttons (✕ and Add files): 32px, quiet until hovered. */
const FIELD_BUTTON =
  "flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-[opacity,scale,filter,color,background-color] duration-150 ease-out-strong hover:bg-accent hover:text-foreground";

/** Keys that focus the field from anywhere on the page. */
const FOCUS_KEY = "/";

/**
 * The search field pinned to the bottom of Home and folder pages. Typing
 * filters the list (the page owns the query); when the text is a URL
 * (or several: `canSave`), Enter saves it instead. `/` or ⌘/Ctrl+K focuses it, Esc
 * clears it (and leaves it when already empty). With `onAddFiles` (uploads
 * on), an Add files button sits at its end while it's empty.
 */
export function LinkOmnibox({
  value,
  onChange,
  onSave,
  canSave,
  placeholder,
  onAddFiles,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Saves what the field holds; called on Enter when `canSave`. */
  onSave: () => void;
  canSave: boolean;
  placeholder: string;
  /** Opens the page's file picker; no Add files button without it. */
  onAddFiles?: () => void;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

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
          if (canSave) onSave();
          else inputRef.current?.blur();
        }}
      >
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          // "Go" on phone keyboards: Enter saves a URL or ends the search.
          enterKeyHint={canSave ? "go" : "search"}
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
        {/* ✕ (with text) and Add files (empty) share one spot and
            cross-fade: opacity, scale and blur (opacity only with reduced
            motion). Both stay mounted; the hidden one is inert. Without
            uploads, the ✕ alone. */}
        <div className="grid shrink-0 place-items-center *:col-start-1 *:row-start-1">
          <button
            type="button"
            aria-label="Clear search"
            inert={!value}
            className={cn(
              FIELD_BUTTON,
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
          {onAddFiles ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Add files"
                  aria-keyshortcuts={UPLOAD_SHORTCUT}
                  inert={Boolean(value)}
                  data-cy="omnibox-add-files"
                  className={cn(
                    FIELD_BUTTON,
                    // 44px to the touch, 32px drawn, like the selection bar.
                    "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
                    value &&
                      "pointer-events-none scale-25 opacity-0 blur-[4px] motion-reduce:scale-100 motion-reduce:blur-none",
                  )}
                  onClick={onAddFiles}
                >
                  <Paperclip className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                Add files
                <Kbd>{UPLOAD_SHORTCUT}</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </form>
    </>
  );
}
