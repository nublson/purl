"use client";

import {
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
  EmojiPicker as EmojiPickerPrimitive,
  type SkinTone,
  useSkinTone,
} from "frimousse";
import { LoaderIcon, SearchIcon } from "lucide-react";
import * as React from "react";

import { Typography } from "@/components/typography";
import { cn } from "@/lib/utils";

// Frimousse's shadcn registry component (frimousse.liveblocks.io/r/emoji-picker),
// restyled. Every inset is 4px (`p-1`) inside a 10px (`rounded-lg`) surface,
// so nested surfaces use 6px (`rounded-sm`): outer radius = inner + padding.
// Emoji data loads from the jsDelivr CDN (Frimousse's default `emojibaseUrl`).

/** Where the picker remembers your skin tone (this browser only). */
const SKIN_TONE_KEY = "purl:emoji-skin-tone";
const SKIN_TONES: readonly SkinTone[] = [
  "none",
  "light",
  "medium-light",
  "medium",
  "medium-dark",
  "dark",
];

function readSkinTone(): SkinTone {
  try {
    const stored = window.localStorage.getItem(SKIN_TONE_KEY);
    return SKIN_TONES.includes(stored as SkinTone) ? (stored as SkinTone) : "none";
  } catch {
    return "none";
  }
}

function writeSkinTone(skinTone: SkinTone) {
  try {
    window.localStorage.setItem(SKIN_TONE_KEY, skinTone);
  } catch {
    // Storage blocked (e.g. private browsing): the tone just isn't remembered.
  }
}

function EmojiPicker({
  className,
  skinTone,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Root>) {
  // Opens with the tone you last picked (read once, when it mounts).
  const [initialSkinTone] = React.useState<SkinTone>(
    () => skinTone ?? (typeof window === "undefined" ? "none" : readSkinTone()),
  );
  return (
    <EmojiPickerPrimitive.Root
      skinTone={initialSkinTone}
      className={cn(
        "isolate flex h-full w-fit flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground",
        className,
      )}
      data-slot="emoji-picker"
      {...props}
    />
  );
}

function EmojiPickerSearch({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Search>) {
  return (
    <div className="p-1" data-slot="emoji-picker-search-wrapper">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <EmojiPickerPrimitive.Search
          className={cn(
            "h-8 w-full min-w-0 rounded-sm border border-input bg-transparent ps-8 pe-2.5 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
            className,
          )}
          placeholder="Search…"
          data-slot="emoji-picker-search"
          {...props}
        />
      </div>
    </div>
  );
}

function EmojiPickerRow({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className="scroll-my-1 px-1" data-slot="emoji-picker-row">
      {children}
    </div>
  );
}

function EmojiPickerEmoji({
  emoji,
  className,
  ...props
}: EmojiPickerListEmojiProps) {
  return (
    <button
      {...props}
      className={cn(
        // `data-active` is Frimousse's hover/keyboard highlight: a static
        // surface change, no animation. Press gets the tactile 0.96 scale.
        "flex size-8 items-center justify-center rounded-sm text-lg leading-none data-active:bg-accent",
        "transition-[scale] duration-150 ease-out active:scale-[0.96]",
        className,
      )}
      data-slot="emoji-picker-emoji"
    >
      {emoji.emoji}
    </button>
  );
}

function EmojiPickerCategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...props}
      className="bg-popover px-2 pt-3 pb-1.5 text-xs leading-none font-medium text-muted-foreground"
      data-slot="emoji-picker-category-header"
    >
      {category.label}
    </div>
  );
}

function EmojiPickerContent({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Viewport>) {
  return (
    <EmojiPickerPrimitive.Viewport
      className={cn("relative flex-1 outline-hidden", className)}
      data-slot="emoji-picker-viewport"
      {...props}
    >
      <EmojiPickerPrimitive.Loading
        className="absolute inset-0 flex items-center justify-center text-muted-foreground"
        data-slot="emoji-picker-loading"
      >
        <LoaderIcon aria-label="Loading emoji" className="size-4 animate-spin" />
      </EmojiPickerPrimitive.Loading>
      <EmojiPickerPrimitive.Empty
        className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        data-slot="emoji-picker-empty"
      >
        No emoji found.
      </EmojiPickerPrimitive.Empty>
      <EmojiPickerPrimitive.List
        className="pb-1 select-none"
        components={{
          Row: EmojiPickerRow,
          Emoji: EmojiPickerEmoji,
          CategoryHeader: EmojiPickerCategoryHeader,
        }}
        data-slot="emoji-picker-list"
      />
    </EmojiPickerPrimitive.Viewport>
  );
}

/** Labels for the tone buttons (`none` is the default yellow). */
const SKIN_TONE_LABELS: Record<SkinTone, string> = {
  none: "Default skin tone",
  light: "Light skin tone",
  "medium-light": "Medium-light skin tone",
  medium: "Medium skin tone",
  "medium-dark": "Medium-dark skin tone",
  dark: "Dark skin tone",
};

/**
 * Footer: the highlighted emoji and its name, and at the end a ✋ in the
 * current skin tone. That button swaps the preview for the six tones;
 * picking one applies it to the whole grid and remembers it.
 */
function EmojiPickerFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [skinTone, setSkinTone, variations] = useSkinTone("✋");
  const [choosing, setChoosing] = React.useState(false);
  const current =
    variations.find((variation) => variation.skinTone === skinTone)?.emoji ??
    "✋";

  return (
    <div
      className={cn(
        "flex w-full max-w-(--frimousse-viewport-width) min-w-0 items-center gap-1 border-t p-1",
        className,
      )}
      data-slot="emoji-picker-footer"
      {...props}
    >
      {choosing ? (
        <div
          role="radiogroup"
          aria-label="Skin tone"
          className="flex min-w-0 flex-1 items-center gap-0.5"
          data-slot="emoji-picker-skin-tones"
        >
          {variations.map((variation) => (
            <button
              key={variation.skinTone}
              type="button"
              role="radio"
              aria-checked={variation.skinTone === skinTone}
              aria-label={SKIN_TONE_LABELS[variation.skinTone]}
              className="flex size-8 items-center justify-center rounded-sm text-lg leading-none transition-[scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] aria-checked:bg-accent"
              onClick={() => {
                setSkinTone(variation.skinTone);
                writeSkinTone(variation.skinTone);
                setChoosing(false);
              }}
            >
              {variation.emoji}
            </button>
          ))}
        </div>
      ) : (
        <EmojiPickerPrimitive.ActiveEmoji>
          {({ emoji }) =>
            emoji ? (
              <>
                <div className="flex size-8 flex-none items-center justify-center text-lg leading-none">
                  {emoji.emoji}
                </div>
                <Typography
                  component="span"
                  size="mini"
                  className="min-w-0 flex-1 truncate text-secondary-foreground"
                >
                  {emoji.label}
                </Typography>
              </>
            ) : (
              <Typography
                component="span"
                size="mini"
                className="ms-2 flex h-8 min-w-0 flex-1 items-center truncate"
              >
                Select an emoji…
              </Typography>
            )
          }
        </EmojiPickerPrimitive.ActiveEmoji>
      )}
      <button
        type="button"
        aria-label={choosing ? "Close skin tones" : "Choose skin tone"}
        aria-expanded={choosing}
        className="ms-auto flex size-8 flex-none items-center justify-center rounded-sm text-lg leading-none transition-[scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] aria-expanded:bg-accent"
        onClick={() => setChoosing((open) => !open)}
        data-slot="emoji-picker-skin-tone-trigger"
      >
        {current}
      </button>
    </div>
  );
}

export {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
};
