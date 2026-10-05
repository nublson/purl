"use client";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFolderActions, type FolderSummary } from "@/hooks/use-folders";
import {
  DEFAULT_FOLDER_EMOJI,
  MAX_FOLDER_DESCRIPTION_LENGTH,
} from "@/lib/folder-display";
import { suggestFolderEmoji } from "@/lib/emoji-suggestion";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { Typography } from "./typography";

// The emoji picker (Frimousse and its search) is the bulk of this dialog's
// code: it loads when a folder dialog opens (`preloadEmojiPicker`), not
// with the page. The placeholder keeps the popover at the picker's size.
const loadEmojiPicker = () => import("./folder-emoji-picker-panel");
// A failed prefetch is fine: opening the picker loads it again.
const preloadEmojiPicker = () => void loadEmojiPicker().catch(() => {});
const FolderEmojiPickerPanel = dynamic(loadEmojiPicker, {
  ssr: false,
  loading: () => <div className="h-80 w-72" aria-hidden />,
});

/** Mirrors the server's folder-name cap in `src/lib/folders.ts` ("Keep the name to 60 characters or fewer."). */
const MAX_NAME_LENGTH = 60;

type DialogFolderFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | {
      mode: "create";
      folder?: undefined;
      /**
       * Set to stay on the page after creating: no "Folder created" toast
       * or navigation; this gets the new folder instead.
       */
      onCreated?: (folder: FolderSummary) => void;
    }
  | { mode: "edit"; folder: FolderSummary; onCreated?: undefined }
);

/**
 * Controlled "New folder" / "Edit folder" dialog. The form mounts only while
 * the dialog is open, so every open starts from fresh state.
 */
export function DialogFolderForm({
  open,
  onOpenChange,
  mode,
  folder,
  onCreated,
}: DialogFolderFormProps) {
  return (
    <DialogWrapper
      title={mode === "create" ? "New folder" : "Edit folder"}
      open={open}
      onOpenChange={onOpenChange}
      content={
        <FolderForm
          folder={folder}
          onCreated={onCreated}
          onDone={() => onOpenChange(false)}
        />
      }
    />
  );
}

/** Which field a server error belongs to, from the API's error `code`. */
type ErrorField = "name" | "description" | "form";

function errorFieldFor(code: string | undefined): ErrorField {
  if (code?.startsWith("NAME_") || code === "INVALID_EMOJI") return "name";
  if (code === "INVALID_DESCRIPTION") return "description";
  return "form";
}

function FolderForm({
  folder,
  onCreated,
  onDone,
}: {
  folder?: FolderSummary;
  onCreated?: (folder: FolderSummary) => void;
  onDone: () => void;
}) {
  const { createFolder, updateFolder } = useFolderActions();
  const [name, setName] = React.useState(folder?.name ?? "");
  // `null` = nothing picked yet: the oyster shows as the placeholder and the
  // server applies it as the default on create.
  const [emoji, setEmoji] = React.useState<string | null>(
    folder?.emoji ?? null,
  );
  const [description, setDescription] = React.useState(
    folder?.description ?? "",
  );
  const [error, setError] = React.useState<{
    field: ErrorField;
    message: string;
  } | null>(null);
  const [pending, setPending] = React.useState(false);
  const nameId = React.useId();
  const nameErrorId = React.useId();
  const descriptionId = React.useId();
  const descriptionErrorId = React.useId();
  const formErrorId = React.useId();

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  // New folders only, until an emoji is picked: the name suggests one
  // ("Reading list" → 📚), which shows on the button and is what gets saved.
  const suggestedEmoji =
    !folder && emoji === null ? suggestFolderEmoji(trimmedName) : null;
  const chosenEmoji = emoji ?? suggestedEmoji;
  const nameChanged = folder ? trimmedName !== folder.name : true;
  const emojiChanged = folder ? emoji !== folder.emoji : emoji !== null;
  const descriptionChanged = folder
    ? trimmedDescription !== (folder.description ?? "")
    : trimmedDescription.length > 0;
  const canSubmit =
    !pending &&
    trimmedName.length > 0 &&
    (nameChanged || emojiChanged || descriptionChanged);

  const nameError = error?.field === "name" ? error.message : null;
  const descriptionError =
    error?.field === "description" ? error.message : null;
  const formError = error?.field === "form" ? error.message : null;

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
          ...(descriptionChanged ? { description: trimmedDescription } : {}),
        })
      : await createFolder(
          {
            name: trimmedName,
            ...(chosenEmoji ? { emoji: chosenEmoji } : {}),
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
          },
          { quiet: onCreated !== undefined },
        );
    setPending(false);

    if (result.ok) {
      onDone();
      if (!folder) onCreated?.(result.data);
    } else {
      setError({ field: errorFieldFor(result.code), message: result.error });
    }
  }

  return (
    <form className="flex flex-col gap-6 px-6 pt-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <Label htmlFor={nameId}>Folder name</Label>
          <div className="flex gap-2">
            <FolderEmojiPicker
              value={emoji}
              suggested={suggestedEmoji}
              disabled={pending}
              invalid={nameError !== null}
              describedBy={nameError ? nameErrorId : undefined}
              onChange={(next) => {
                setEmoji(next);
                if (error) setError(null);
              }}
            />
            <Input
              id={nameId}
              name="name"
              type="text"
              placeholder="Reading list"
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
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
            />
          </div>
          {nameError ? (
            <Typography
              component="p"
              size="small"
              id={nameErrorId}
              role="alert"
              className="text-destructive"
            >
              {nameError}
            </Typography>
          ) : null}
        </Field>
        <Field>
          <Label htmlFor={descriptionId}>Folder description</Label>
          <Input
            id={descriptionId}
            name="description"
            type="text"
            placeholder="Long reads for the weekend"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (error) setError(null);
            }}
            maxLength={MAX_FOLDER_DESCRIPTION_LENGTH}
            autoComplete="off"
            disabled={pending}
            aria-invalid={descriptionError ? true : undefined}
            aria-describedby={descriptionError ? descriptionErrorId : undefined}
          />
          {descriptionError ? (
            <Typography
              component="p"
              size="small"
              id={descriptionErrorId}
              role="alert"
              className="text-destructive"
            >
              {descriptionError}
            </Typography>
          ) : null}
        </Field>
        {formError ? (
          <Typography
            component="p"
            size="small"
            id={formErrorId}
            role="alert"
            className="text-destructive"
          >
            {formError}
          </Typography>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!canSubmit}>
          {folder
            ? pending
              ? "Saving…"
              : "Save changes"
            : pending
              ? "Creating…"
              : "Create folder"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Square button showing the folder's emoji (the oyster until one is picked)
 * that opens the emoji picker in a popover. Picking closes the popover and
 * returns focus to the button.
 */
function FolderEmojiPicker({
  value,
  disabled,
  invalid,
  describedBy,
  onChange,
  suggested,
}: {
  value: string | null;
  /** Shown (and saved) while nothing is picked; `null` = no suggestion. */
  suggested?: string | null;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Mounted with the open dialog: fetch the picker now, so it's there by
  // the time the button is pressed.
  React.useEffect(preloadEmojiPicker, []);
  const shown = value ?? suggested ?? DEFAULT_FOLDER_EMOJI;
  const isSuggestion = value === null && Boolean(suggested);

  return (
    // Modal so the popover's scroll lock sits above the dialog's: without it
    // the dialog swallows wheel/touch scrolling inside the portaled picker.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={`Folder emoji: ${shown}${isSuggestion ? " (suggested)" : ""}. Choose another`}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="text-lg leading-none"
        >
          <Typography
            // Remounts when the emoji changes, so a new suggestion fades in
            // (opacity and scale only; reduced motion: fade).
            key={shown}
            component="span"
            aria-hidden="true"
            className={cn(
              "text-lg leading-none",
              isSuggestion &&
                "animate-in fade-in-0 zoom-in-75 duration-150 ease-out-strong motion-reduce:[--tw-enter-scale:1]",
            )}
          >
            {shown}
          </Typography>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Keeps the picker inside the 16px page margin on narrow screens.
        collisionPadding={16}
        // Above the dialog (`DialogWrapper` raises it to z-51).
        className="z-52 w-auto gap-0 rounded-lg p-0"
      >
        <FolderEmojiPickerPanel
          onSelect={(emoji) => {
            onChange(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
