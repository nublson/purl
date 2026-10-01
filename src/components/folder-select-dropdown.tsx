"use client";

import {
  useCurrentFolder,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { Check, ChevronDown, Pencil, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { DialogDeleteFolder } from "./dialog-delete-folder";
import { DialogFolderForm } from "./dialog-folder-form";
import { DropdownWrapper } from "./dropdown-wrapper";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

const HOME_EMOJI = "🏠";

type FolderDialog =
  | { kind: "create" }
  | { kind: "edit"; folder: FolderSummary }
  | { kind: "delete"; folder: FolderSummary };

/**
 * Header folder switcher: shows where you are (Home or the current folder),
 * links to every folder, and opens the New / Edit / Delete folder dialogs.
 */
export function FolderSelectDropdown() {
  const { folders, max, totalLinks } = useFolders();
  const currentFolder = useCurrentFolder();
  const pathname = usePathname();
  const onHome = pathname === "/home";
  const atCap = folders.length >= max;
  const capHintId = React.useId();

  // Dialogs live outside the menu (Radix only mounts menu content while it's
  // open). A menu item records which dialog it wants; it opens from the
  // menu's onCloseAutoFocus, once focus is back on the trigger, so the dialog
  // returns focus there when it closes. Same pattern as Settings in user.tsx.
  const pendingDialog = React.useRef<FolderDialog | null>(null);
  // `dialog` survives closing so the exit animation still has its folder.
  const [dialog, setDialog] = React.useState<FolderDialog | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const label = currentFolder?.name ?? "Home";

  return (
    <>
      {dialog?.kind === "create" ? (
        <DialogFolderForm
          mode="create"
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <DialogFolderForm
          mode="edit"
          folder={dialog.folder}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DialogDeleteFolder
          folder={dialog.folder}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
      <DropdownWrapper
        className="w-60"
        align="start"
        onCloseAutoFocus={() => {
          const next = pendingDialog.current;
          if (!next) return;
          pendingDialog.current = null;
          setDialog(next);
          setDialogOpen(true);
        }}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Folder: ${label}`}
            // Emoji side gets 2px less padding than the text default
            // (optical alignment); the chevron uses Button's inline-end inset.
            className="max-w-52 min-w-0 shrink ps-2"
          >
            <FolderEmoji emoji={currentFolder?.emoji ?? HOME_EMOJI} />
            <Typography
              component="span"
              size="small"
              className="min-w-0 truncate text-foreground"
            >
              {label}
            </Typography>
            <ChevronDown
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        }
      >
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/home" aria-current={onHome ? "page" : undefined}>
              <FolderEmoji emoji={HOME_EMOJI} />
              <RowLabel name="Home" count={totalLinks} />
              <CurrentMark active={onHome} />
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {/*
          Only the folders scroll, so Home and the New/Edit/Delete actions stay
          in view at any folder count. 240px = 7.5 rows: the half-visible row
          at the bottom is the cue that the list scrolls.
        */}
        <DropdownMenuGroup className="max-h-60 overflow-y-auto overscroll-y-contain">
          {folders.map((folder) => {
            const active = currentFolder?.id === folder.id;
            return (
              <DropdownMenuItem key={folder.id} asChild>
                <Link
                  href={`/folders/${folder.slug}`}
                  aria-current={active ? "page" : undefined}
                >
                  <FolderEmoji emoji={folder.emoji} />
                  <RowLabel name={folder.name} count={folder.linkCount} />
                  <CurrentMark active={active} />
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={atCap}
            aria-describedby={atCap ? capHintId : undefined}
            onSelect={() => {
              pendingDialog.current = { kind: "create" };
            }}
          >
            <Plus />
            New folder…
          </DropdownMenuItem>
          {atCap ? (
            <Typography
              component="p"
              size="mini"
              id={capHintId}
              className="px-2 pb-1.5 text-muted-foreground"
            >
              You can have up to {max} folders.
            </Typography>
          ) : null}
          {currentFolder ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  pendingDialog.current = {
                    kind: "edit",
                    folder: currentFolder,
                  };
                }}
              >
                <Pencil />
                Edit folder…
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  pendingDialog.current = {
                    kind: "delete",
                    folder: currentFolder,
                  };
                }}
              >
                <Trash />
                Delete folder…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuGroup>
      </DropdownWrapper>
    </>
  );
}

/**
 * Row name with its link count right beside it (the name truncates first);
 * the check mark is pushed to the row's end by `CurrentMark`.
 */
function RowLabel({ name, count }: { name: string; count: number | null }) {
  return (
    <Typography
      component="span"
      className="flex min-w-0 items-baseline gap-1.5"
    >
      <Typography
        component="span"
        size="small"
        className="min-w-0 truncate text-foreground"
      >
        {name}
      </Typography>
      {count !== null ? (
        <Typography
          component="span"
          size="mini"
          className="shrink-0 tabular-nums"
        >
          {count}
        </Typography>
      ) : null}
    </Typography>
  );
}

/** Fixed-width trailing slot so counts line up whether or not a row is checked. */
function CurrentMark({ active }: { active: boolean }) {
  return (
    <Typography
      component="span"
      className="ms-auto flex size-4 shrink-0 items-center justify-center"
    >
      {active ? <Check aria-hidden="true" /> : null}
    </Typography>
  );
}
