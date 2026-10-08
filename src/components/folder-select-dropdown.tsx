"use client";

import {
  useCurrentFolder,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { Check, ChevronDown, Pen, Plus, SortV, Trash2 } from "reicon-react";
import {
  folderShortcutKey,
  HOME_SHORTCUT,
  matchFolderShortcut,
} from "@/lib/folder-shortcuts";
import { useDemoFolderSelect, useIsDemo } from "@/contexts/demo-mode-context";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { DialogDeleteFolder } from "./dialog-delete-folder";
import { DialogFolderForm } from "./dialog-folder-form";
import {
  DialogReorderFolders,
  preloadReorderFoldersList,
} from "./dialog-reorder-folders";
import { DropdownWrapper } from "./dropdown-wrapper";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

const HOME_EMOJI = "🏠";

/**
 * Lines the menu's emoji and names up under the trigger's. The trigger's
 * emoji sits 9px in (1px border + 8px `ps-2`); a menu row's sits 12px in
 * (4px menu `p-1` + 8px item `px-2`). Shifting the menu 3px toward the
 * leading edge puts both emoji columns on one edge, and the trigger's
 * `gap-2` matches the rows' 8px gap, so the names share an edge too.
 */
const MENU_ALIGN_OFFSET = -3;

type FolderDialog =
  | { kind: "create" }
  | { kind: "edit"; folder: FolderSummary }
  | { kind: "delete"; folder: FolderSummary }
  | { kind: "reorder" };

/**
 * Header folder switcher: shows where you are (Home or the current folder),
 * links to every folder (in the user's order), and opens the New / Reorder /
 * Edit / Delete folder dialogs. Digit keys switch folders anywhere in the app
 * (1 = Home, then 2–9 and 0 for the first nine folders in menu order); each
 * row shows its key unless it's current.
 */
export function FolderSelectDropdown() {
  const { folders, max, totalLinks } = useFolders();
  const currentFolder = useCurrentFolder();
  const pathname = usePathname();
  const onHome = pathname === "/home";
  const atCap = folders.length >= max;
  const capHintId = React.useId();
  const router = useRouter();
  // The landing page's demo has no routes: folders switch in place, and
  // everything that writes or navigates away is disabled.
  const isDemo = useIsDemo();
  const demoSelectFolder = useDemoFolderSelect();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The Reorder dialog's list (Motion's drag) loads while the menu is open,
  // so it's ready by the time the dialog is.
  React.useEffect(() => {
    if (menuOpen && !isDemo && folders.length >= 2) preloadReorderFoldersList();
  }, [menuOpen, isDemo, folders.length]);

  /** Handles a folder shortcut; returns whether the key was one. */
  const goToShortcut = React.useCallback(
    (event: KeyboardEvent | React.KeyboardEvent) => {
      const target = matchFolderShortcut(event, folders);
      if (!target) return false;
      if (isDemo) {
        // Home leaves the demo, so 1 does nothing there.
        if (target === "home") return false;
        event.preventDefault();
        setMenuOpen(false);
        demoSelectFolder?.(target.id);
        return true;
      }
      event.preventDefault();
      const href = target === "home" ? "/home" : `/folders/${target.slug}`;
      setMenuOpen(false);
      if (pathname !== href) router.push(href);
      return true;
    },
    [folders, pathname, router, isDemo, demoSelectFolder],
  );

  // Anywhere in the app, except while typing or with a dialog or menu open
  // (this menu handles its own keys below).
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      goToShortcut(event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goToShortcut]);

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
      {dialog?.kind === "reorder" ? (
        <DialogReorderFolders open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
      <DropdownWrapper
        open={menuOpen}
        onOpenChange={setMenuOpen}
        // Digits switch folders here too, ahead of the menu's typeahead.
        onKeyDown={(event) => {
          if (!event.repeat) goToShortcut(event);
        }}
        className="w-60"
        align="start"
        alignOffset={MENU_ALIGN_OFFSET}
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
            // `gap-2` matches the menu rows (see MENU_ALIGN_OFFSET).
            className="max-w-52 min-w-0 shrink gap-2 ps-2"
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
          {isDemo ? (
            <DropdownMenuItem disabled>
              <FolderEmoji emoji={HOME_EMOJI} />
              <RowLabel name="Home" count={totalLinks} />
              <CurrentMark active={false} />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link
                href="/home"
                aria-current={onHome ? "page" : undefined}
                aria-keyshortcuts={HOME_SHORTCUT}
              >
                <FolderEmoji emoji={HOME_EMOJI} />
                <RowLabel name="Home" count={totalLinks} />
                <CurrentMark active={onHome} shortcut={HOME_SHORTCUT} />
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {/*
          Only the folders scroll, so Home and the New/Edit/Delete actions stay
          in view at any folder count. 240px = 7.5 rows: the half-visible row
          at the bottom is the cue that the list scrolls.
        */}
        <DropdownMenuGroup className="max-h-60 overflow-y-auto overscroll-y-contain">
          {folders.map((folder, index) => {
            const active = currentFolder?.id === folder.id;
            if (demoSelectFolder) {
              return (
                <DropdownMenuItem
                  key={folder.id}
                  aria-current={active ? "true" : undefined}
                  aria-keyshortcuts={folderShortcutKey(index) ?? undefined}
                  onSelect={() => demoSelectFolder(folder.id)}
                >
                  <FolderEmoji emoji={folder.emoji} />
                  <RowLabel name={folder.name} count={folder.linkCount} />
                  <CurrentMark
                    active={active}
                    shortcut={folderShortcutKey(index)}
                  />
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem key={folder.id} asChild>
                <Link
                  href={`/folders/${folder.slug}`}
                  aria-current={active ? "page" : undefined}
                  aria-keyshortcuts={folderShortcutKey(index) ?? undefined}
                >
                  <FolderEmoji emoji={folder.emoji} />
                  <RowLabel name={folder.name} count={folder.linkCount} />
                  <CurrentMark
                    active={active}
                    shortcut={folderShortcutKey(index)}
                  />
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={atCap || isDemo}
            aria-describedby={atCap ? capHintId : undefined}
            onSelect={() => {
              pendingDialog.current = { kind: "create" };
            }}
          >
            <Plus />
            New folder
          </DropdownMenuItem>
          {atCap ? (
            <Typography
              component="p"
              size="mini"
              id={capHintId}
              className="px-2 pb-1.5 text-muted-foreground"
            >
              You’ve reached {max} folders. Delete one to add another.
            </Typography>
          ) : null}
          {folders.length >= 2 ? (
            <DropdownMenuItem
              disabled={isDemo}
              onSelect={() => {
                pendingDialog.current = { kind: "reorder" };
              }}
            >
              <SortV />
              Reorder folders
            </DropdownMenuItem>
          ) : null}
          {currentFolder ? (
            <>
              <DropdownMenuItem
                disabled={isDemo}
                onSelect={() => {
                  pendingDialog.current = {
                    kind: "edit",
                    folder: currentFolder,
                  };
                }}
              >
                <Pen />
                Edit folder
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isDemo}
                onSelect={() => {
                  pendingDialog.current = {
                    kind: "delete",
                    folder: currentFolder,
                  };
                }}
              >
                <Trash2 />
                Delete folder
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

/**
 * Trailing slot: the check on the current row, otherwise the row's shortcut
 * key. Fixed width, so counts line up whichever it shows.
 */
function CurrentMark({
  active,
  shortcut,
}: {
  active: boolean;
  shortcut?: string | null;
}) {
  return (
    <Typography
      component="span"
      className="ms-auto flex h-4 min-w-5 shrink-0 items-center justify-center"
    >
      {active ? (
        <Check aria-hidden="true" />
      ) : shortcut ? (
        <Kbd aria-hidden="true">{shortcut}</Kbd>
      ) : null}
    </Typography>
  );
}
