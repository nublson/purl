"use client";

import {
  useCurrentFolder,
  useFolderActions,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { Check, ChevronDown, Pen, Plus, Reorder as GripIcon, Trash2 } from "reicon-react";
import {
  folderShortcutKey,
  HOME_SHORTCUT,
  matchFolderShortcut,
} from "@/lib/folder-shortcuts";
import { useDemoFolderSelect, useIsDemo } from "@/contexts/demo-mode-context";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import type {
  FolderGripProps,
  ReorderableFolderRows as ReorderableFolderRowsType,
} from "./folder-menu-reorder";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { DialogDeleteFolder } from "./dialog-delete-folder";
import { DialogFolderForm } from "./dialog-folder-form";
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

// Motion's drag, for reordering folders: its own chunk, loaded on demand.
const loadReorderableRows = () =>
  import("./folder-menu-reorder").then((mod) => mod.ReorderableFolderRows);

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
  | { kind: "delete"; folder: FolderSummary };

/**
 * Header folder switcher: shows where you are (Home or the current folder),
 * links to every folder (in the user's order), and opens the New / Edit /
 * Delete folder dialogs. Digit keys switch folders anywhere in the app
 * (1 = Home, then 2–9 and 0 for the first nine folders in menu order); each
 * row shows its key unless it's current.
 *
 * Folders reorder in place: drag a row by its grip (on hover it replaces the
 * emoji; on touch screens it's always at the row's end, where the unusable
 * shortcut key was), or ⌥↑ / ⌥↓ on the highlighted row. Each drop saves.
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
  const { reorderFolders } = useFolderActions();
  const canReorder = !isDemo && folders.length >= 2;
  const reorderHintId = React.useId();
  const [announcement, setAnnouncement] = React.useState("");
  // Clear, then set on the next frame: a message identical to the last one
  // ("Alpha is already last" twice) is still a change, so it's read again.
  const announce = React.useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  // Set by a drag; the menu swallows clicks meanwhile (see onClickCapture).
  const suppressClicks = React.useRef(false);
  const setSuppressClicks = React.useCallback((active: boolean) => {
    suppressClicks.current = active;
  }, []);
  // Motion's drag loads when the menu first opens (or the pointer nears its
  // trigger); until then rows show without grips, and ⌥↑ / ⌥↓ still work.
  const [ReorderableRows, setReorderableRows] = React.useState<
    typeof ReorderableFolderRowsType | null
  >(null);
  const loadReorder = React.useCallback(() => {
    if (!canReorder || ReorderableRows) return;
    loadReorderableRows()
      .then((component) => setReorderableRows(() => component))
      .catch(() => {});
  }, [canReorder, ReorderableRows]);
  React.useEffect(() => {
    if (menuOpen) loadReorder();
  }, [menuOpen, loadReorder]);

  // Keep focus (the menu's highlight) on a folder whose row remounts: after a
  // keyboard move, and when the draggable rows replace the plain ones.
  const refocusId = React.useRef<string | null>(null);
  const focusedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = refocusId.current;
    refocusId.current = null;
    if (!id) return;
    document
      .querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, [folders]);
  React.useLayoutEffect(() => {
    const id = focusedId.current;
    if (!ReorderableRows || !id) return;
    if (document.activeElement?.closest("[data-folder-id]")) return;
    document
      .querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, [ReorderableRows]);

  const saveOrder = React.useCallback(
    (ids: string[], moved: FolderSummary) => {
      const position = ids.indexOf(moved.id) + 1;
      announce(`${moved.name} moved to position ${position} of ${ids.length}`);
      void reorderFolders(ids);
    },
    [reorderFolders, announce],
  );

  /** ⌥↑ / ⌥↓ on a folder row: moves it one place. */
  const moveWithKeyboard = (event: React.KeyboardEvent, folder: FolderSummary) => {
    if (!canReorder || !event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    const from = folders.findIndex((f) => f.id === folder.id);
    const to = event.key === "ArrowUp" ? from - 1 : from + 1;
    if (from === -1) return;
    if (to < 0 || to >= folders.length) {
      announce(`${folder.name} is already ${to < 0 ? "first" : "last"}`);
      return;
    }
    const ids = folders.map((f) => f.id);
    ids.splice(from, 1);
    ids.splice(to, 0, folder.id);
    refocusId.current = folder.id;
    saveOrder(ids, folder);
  };

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

  /** A folder's menu row; `grip` once drag has loaded. */
  const folderRow = (
    folder: FolderSummary,
    index: number,
    grip?: FolderGripProps,
  ) => {
    const active = currentFolder?.id === folder.id;
    const shortcut = folderShortcutKey(index);
    return (
      <DropdownMenuItem
        key={folder.id}
        asChild
        onKeyDown={(event) => moveWithKeyboard(event, folder)}
      >
        <Link
          href={`/folders/${folder.slug}`}
          data-folder-id={folder.id}
          aria-current={active ? "page" : undefined}
          aria-keyshortcuts={shortcut ?? undefined}
          aria-describedby={canReorder ? reorderHintId : undefined}
          onFocus={() => {
            focusedId.current = folder.id;
          }}
          onBlur={() => {
            if (focusedId.current === folder.id) focusedId.current = null;
          }}
          className="group/row select-none"
        >
          {/* Mouse and keyboard: the grip takes the emoji's place on the
              highlighted row (Radix highlights on hover and on arrow keys). */}
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <FolderEmoji
              emoji={folder.emoji}
              className={grip ? "pointer-fine:group-data-highlighted/row:invisible" : undefined}
            />
            {grip ? (
              <FolderGrip
                {...grip}
                // 20px icon: its lines then span ~13px, the emoji's ink width
                // (at 16px they'd read as an indented, smaller icon).
                className="absolute -inset-1 hidden pointer-fine:group-data-highlighted/row:flex [&_svg]:size-5"
              />
            ) : null}
          </span>
          <RowLabel name={folder.name} count={folder.linkCount} />
          <CurrentMark active={active} shortcut={shortcut} hideOnTouch={canReorder} />
          {/* Touch: always there, at the end (no digit keys to show). Until
              drag loads, an empty slot of its size, so rows don't reflow. */}
          {canReorder && !grip ? (
            <span
              aria-hidden="true"
              className="-my-1.5 -me-1.5 hidden size-8 shrink-0 pointer-coarse:block"
            />
          ) : null}
          {grip ? (
            <FolderGrip
              {...grip}
              // 32px drawn; 44px wide to the touch. Not taller: rows are 33px
              // apart, and the extra would reach into the next row's grip.
              className={cn(
                "relative -my-1.5 -me-1.5 hidden size-8 shrink-0 pointer-coarse:flex after:absolute after:inset-y-0 after:-inset-x-1.5",
                !active && "pointer-coarse:ms-auto",
              )}
            />
          ) : null}
        </Link>
      </DropdownMenuItem>
    );
  };

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
        open={menuOpen}
        onOpenChange={setMenuOpen}
        // Digits switch folders here too, ahead of the menu's typeahead.
        onKeyDown={(event) => {
          if (!event.repeat) goToShortcut(event);
        }}
        // A drag's release must not activate the item it lands on (a folder,
        // Home, New/Edit/Delete): Radix clicks the item under a pointerup.
        onClickCapture={(event) => {
          if (!suppressClicks.current) return;
          event.preventDefault();
          event.stopPropagation();
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
            onPointerEnter={loadReorder}
            onFocus={loadReorder}
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
                <CurrentMark
                  active={onHome}
                  shortcut={HOME_SHORTCUT}
                  className={canReorder ? "pointer-coarse:hidden" : undefined}
                />
                {/* Touch: Home has no grip, so its check sits in the folders'
                    grip column, lined up with the grips. */}
                {canReorder ? (
                  <Typography
                    component="span"
                    data-current-mark=""
                    aria-hidden="true"
                    className="-my-1.5 -me-1.5 ms-auto hidden size-8 shrink-0 items-center justify-center pointer-coarse:flex"
                  >
                    {onHome ? <Check /> : null}
                  </Typography>
                ) : null}
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
          {demoSelectFolder
            ? folders.map((folder, index) => {
                const active = currentFolder?.id === folder.id;
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
              })
            : canReorder && ReorderableRows
              ? (
                <ReorderableRows
                  folders={folders}
                  onReorder={saveOrder}
                  renderRow={folderRow}
                  onDragActiveChange={setSuppressClicks}
                />
              )
              : folders.map((folder, index) => folderRow(folder, index))}
        </DropdownMenuGroup>
        {canReorder ? (
          <>
            <span id={reorderHintId} className="sr-only">
              With a keyboard, Alt (Option) with Up or Down moves this folder.
            </span>
            {/* Inside the menu: Radix hides the rest of the page from
                assistive tech while it's open, and moves only happen then. */}
            <span role="status" aria-live="polite" className="sr-only">
              {announcement}
            </span>
          </>
        ) : null}
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
        // The full name when it's cut off (the row's accessible name has it).
        title={name}
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
  hideOnTouch = false,
  className,
}: {
  active: boolean;
  shortcut?: string | null;
  /**
   * Touch screens show the row's grip here instead: no digit keys there, so
   * the slot goes (keeping the check on the current row).
   */
  hideOnTouch?: boolean;
  className?: string;
}) {
  return (
    <Typography
      component="span"
      data-current-mark=""
      className={cn(
        "ms-auto flex h-4 min-w-5 shrink-0 items-center justify-center",
        hideOnTouch && !active && "pointer-coarse:hidden",
        className,
      )}
    >
      {active ? (
        <Check aria-hidden="true" />
      ) : shortcut ? (
        <Kbd aria-hidden="true">{shortcut}</Kbd>
      ) : null}
    </Typography>
  );
}

/** A folder row's drag handle; decorative to assistive tech (⌥↑ / ⌥↓ do the same). */
function FolderGrip({
  onPointerDown,
  onClick,
  className,
}: FolderGripProps & { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-folder-grip=""
      onPointerDown={onPointerDown}
      // Rows are links, which the browser drags natively (cancelling the
      // pointer events Motion's drag runs on): not from the grip.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground active:cursor-grabbing",
        className,
      )}
    >
      <GripIcon className="size-4" />
    </span>
  );
}
