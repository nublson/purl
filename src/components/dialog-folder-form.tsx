"use client";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFolderActions, type FolderSummary } from "@/hooks/use-folders";
import {
  DEFAULT_FOLDER_EMOJI,
  FOLDER_EMOJI_PRESETS,
  type FolderEmojiPreset,
} from "@/lib/folder-display";
import { cn } from "@/lib/utils";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";

/** Mirrors the server's folder-name cap in `src/lib/folders.ts` ("Keep it under 60 characters."). */
const MAX_NAME_LENGTH = 60;

type DialogFolderFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & ({ mode: "create"; folder?: undefined } | { mode: "edit"; folder: FolderSummary });

/**
 * Controlled "New folder" / "Edit folder" dialog. The form mounts only while
 * the dialog is open, so every open starts from fresh state.
 */
export function DialogFolderForm({
  open,
  onOpenChange,
  mode,
  folder,
}: DialogFolderFormProps) {
  return (
    <DialogWrapper
      title={mode === "create" ? "New folder" : "Edit folder"}
      open={open}
      onOpenChange={onOpenChange}
      content={
        <FolderForm folder={folder} onDone={() => onOpenChange(false)} />
      }
    />
  );
}

function FolderForm({
  folder,
  onDone,
}: {
  folder?: FolderSummary;
  onDone: () => void;
}) {
  const { createFolder, updateFolder } = useFolderActions();
  const [name, setName] = React.useState(folder?.name ?? "");
  const [emoji, setEmoji] = React.useState(folder?.emoji ?? DEFAULT_FOLDER_EMOJI);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const nameId = React.useId();
  const errorId = React.useId();
  const emojiLabelId = React.useId();

  const trimmedName = name.trim();
  const nameChanged = folder ? trimmedName !== folder.name : true;
  const emojiChanged = folder ? emoji !== folder.emoji : true;
  const canSubmit =
    !pending && trimmedName.length > 0 && (nameChanged || emojiChanged);

  // A folder whose emoji was set outside the presets (e.g. via the API)
  // keeps it as the first option, so editing the name doesn't silently drop it.
  const options = React.useMemo<readonly FolderEmojiPreset[]>(() => {
    if (!folder || FOLDER_EMOJI_PRESETS.some((p) => p.emoji === folder.emoji)) {
      return FOLDER_EMOJI_PRESETS;
    }
    return [{ emoji: folder.emoji, label: "Current" }, ...FOLDER_EMOJI_PRESETS];
  }, [folder]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!canSubmit) return;

    setPending(true);
    setError(null);
    const result = folder
      ? await updateFolder(folder.id, {
          ...(nameChanged ? { name: trimmedName } : {}),
          ...(emojiChanged ? { emoji } : {}),
        })
      : await createFolder({ name: trimmedName, emoji });
    setPending(false);

    if (result.ok) {
      onDone();
    } else {
      setError(result.error);
    }
  }

  return (
    <form className="flex flex-col gap-6 px-6 pt-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            name="name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
            required
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </Field>
        <Field>
          <Label id={emojiLabelId} asChild>
            <span>Emoji</span>
          </Label>
          <EmojiPicker
            labelledBy={emojiLabelId}
            options={options}
            value={emoji}
            disabled={pending}
            onChange={(next) => {
              setEmoji(next);
              if (error) setError(null);
            }}
          />
        </Field>
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!canSubmit}>
          {folder ? (pending ? "Saving…" : "Save") : pending ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const NAV_KEYS: Record<string, (index: number, length: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/**
 * Single-select emoji grid with radio semantics: one tab stop (the selected
 * tile), arrow keys move and select, like a native radio group.
 */
function EmojiPicker({
  labelledBy,
  options,
  value,
  disabled,
  onChange,
}: {
  labelledBy: string;
  options: readonly FolderEmojiPreset[];
  value: string;
  disabled: boolean;
  onChange: (emoji: string) => void;
}) {
  const tileRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.emoji === value),
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const move = NAV_KEYS[e.key];
    if (!move) return;
    e.preventDefault();
    const next = move(selectedIndex, options.length);
    onChange(options[next].emoji);
    tileRefs.current[next]?.focus();
  }

  return (
    // Concentric: 14px outer radius = 10px tile radius + 4px padding.
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={handleKeyDown}
      className="grid w-fit grid-cols-6 gap-1 rounded-[14px] bg-muted p-1"
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={option.emoji}
            ref={(node) => {
              tileRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.emoji)}
            className={cn(
              "flex size-10 items-center justify-center rounded-[10px] text-xl leading-none outline-none select-none",
              "transition-[scale,background-color,box-shadow] duration-150 ease-out active:scale-[0.96]",
              "hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "disabled:pointer-events-none disabled:opacity-50",
              // Static selected cue (surface + ring), not motion alone.
              "aria-checked:bg-background aria-checked:shadow-sm aria-checked:ring-2 aria-checked:ring-primary",
            )}
          >
            <span aria-hidden="true">{option.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
