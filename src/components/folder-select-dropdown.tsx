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
  const { folders, max } = useFolders();
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
            className="max-w-52 min-w-0 shrink pl-2"
          >
            <FolderEmoji emoji={currentFolder?.emoji ?? HOME_EMOJI} />
            <span className="min-w-0 truncate">{label}</span>
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
              <span className="min-w-0 flex-1 truncate">Home</span>
              <CurrentMark active={onHome} />
            </Link>
          </DropdownMenuItem>
          {folders.map((folder) => {
            const active = currentFolder?.id === folder.id;
            return (
              <DropdownMenuItem key={folder.id} asChild>
                <Link
                  href={`/folders/${folder.slug}`}
                  aria-current={active ? "page" : undefined}
                >
                  <FolderEmoji emoji={folder.emoji} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {folder.linkCount}
                  </span>
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
            <p
              id={capHintId}
              className="px-2 pb-1.5 text-xs text-muted-foreground"
            >
              You can have up to {max} folders.
            </p>
          ) : null}
          {currentFolder ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  pendingDialog.current = { kind: "edit", folder: currentFolder };
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

/** Fixed-width trailing slot so counts line up whether or not a row is checked. */
function CurrentMark({ active }: { active: boolean }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {active ? <Check aria-hidden="true" /> : null}
    </span>
  );
}
