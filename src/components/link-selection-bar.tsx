"use client";

import {
  useCurrentFolder,
  useFolderActions,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { formatLinkCount } from "@/lib/folder-display";
import {
  linkSelection,
  useSelectableLinkCount,
  useSelectedLinkIds,
} from "@/lib/link-selection";
import {
  matchSelectionShortcut,
  selectionShortcutLabel,
  type SelectionShortcut,
} from "@/lib/link-selection-shortcuts";
import { deleteLinksWithUndo } from "@/lib/pending-link-deletes";
import { EASE_OUT_STRONG } from "@/lib/motion";
import { isApplePlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronUp,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Minus,
  Trash,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";
import { DialogFolderForm } from "./dialog-folder-form";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** Keys typed into these are text, not selection shortcuts. */
const TEXT_TARGETS =
  "input, textarea, select, [contenteditable=''], [contenteditable='true']";

/**
 * Floating bar for the selected links (Home or a folder page): the count
 * (which clears the selection), Select all / Deselect all, Move (folders,
 * "Remove from …", "New folder…") and Delete, each with its shortcut in the
 * tooltip. Shown while anything is selected.
 *
 * `folderOf` gives a loaded link's folder id (null when unfiled), so Move
 * on Home only offers "Remove from folders" when a selected link is in one.
 */
export function LinkSelectionBar({
  folderOf,
}: {
  folderOf: (linkId: string) => string | null | undefined;
}) {
  const selectedIds = useSelectedLinkIds();
  const selectableCount = useSelectableLinkCount();
  const count = selectedIds.size;
  const allSelected = count > 0 && count >= selectableCount;
  const [apple, setApple] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  // Set by "New folder…": the dialog opens once the menu has closed and
  // handed focus back to the Move button, so the dialog returns it there.
  const pendingNewFolder = React.useRef(false);
  // The links "New folder…" was chosen for, moved once the folder exists.
  const newFolderLinks = React.useRef<string[]>([]);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  // Reduced motion: the bar still fades, but doesn't slide.
  const reduceMotion = useReducedMotion();

  const { notifyLinksChanged } = useLinksSyncActions();
  const { moveLinks } = useFolderActions();

  // Platform is only known in the browser; render the generic labels first.
  React.useEffect(() => setApple(isApplePlatform()), []);

  const moveTo = React.useCallback(
    async (
      folderId: string | null,
      ids = linkSelection.selectedIds(),
      target?: FolderSummary,
    ) => {
      if (ids.length === 0) return;
      const result = await moveLinks(ids, folderId, { target });
      if (result.ok) linkSelection.clear();
    },
    [moveLinks],
  );

  const deleteSelected = React.useCallback(() => {
    const ids = linkSelection.selectedIds();
    if (ids.length === 0) return;
    deleteLinksWithUndo(ids, { onDeleted: notifyLinksChanged });
    linkSelection.clear();
  }, [notifyLinksChanged]);

  const toggleAll = React.useCallback(() => {
    if (linkSelection.selectedIds().length >= selectableCount) {
      linkSelection.clear();
    } else {
      linkSelection.selectAll();
    }
  }, [selectableCount]);

  // Shortcuts, only while something is selected and no dialog or menu is
  // open (they handle their own keys, e.g. Esc closes the Move menu first).
  React.useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest(TEXT_TARGETS)
      ) {
        return;
      }
      if (document.body.hasAttribute("data-scroll-locked")) return;
      const shortcut = matchSelectionShortcut(event, {
        apple: isApplePlatform(),
      });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "clear") linkSelection.clear();
      else if (shortcut === "selectAll") linkSelection.selectAll();
      else if (shortcut === "delete") deleteSelected();
      else setMoveOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, deleteSelected]);

  // Arrow keys move between the bar's buttons (toolbar pattern).
  const onToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  // The count while the bar animates out (the selection is already empty).
  const [shownCount, setShownCount] = React.useState(count);
  if (count > 0 && count !== shownCount) setShownCount(count);

  return (
    <>
      {/* Always mounted, so clearing is announced too. */}
      <Typography component="span" role="status" className="sr-only">
        {count > 0 ? `${formatLinkCount(count)} selected` : ""}
      </Typography>
      <DialogFolderForm
        mode="create"
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        onCreated={(folder) => {
          void moveTo(folder.id, newFolderLinks.current, folder);
        }}
      />
      <AnimatePresence initial={false}>
        {count > 0 ? (
          <motion.div
            key="link-selection-bar"
            ref={toolbarRef}
            role="toolbar"
            aria-label="Selected links"
            onKeyDown={onToolbarKeyDown}
            // Rises from where it's anchored (the bottom edge). Full
            // transform strings stay on the GPU; `x`/`y` shorthands don't.
            initial={{
              opacity: 0,
              transform: reduceMotion ? "translateY(0px)" : "translateY(8px)",
            }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            // Out the way it came, shorter and quicker than the entrance.
            exit={{
              opacity: 0,
              transform: reduceMotion ? "translateY(0px)" : "translateY(4px)",
              transition: { duration: 0.15, ease: EASE_OUT_STRONG },
            }}
            transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}
            className={cn(
              "fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-xl bg-popover p-1 text-popover-foreground",
              // Elevation from layered shadows; the 1px ring is the edge.
              "shadow-[0_0_0_1px_var(--border),0_2px_4px_-1px_oklch(0_0_0/0.12),0_8px_24px_-4px_oklch(0_0_0/0.24)]",
            )}
          >
            <ShortcutTooltip
              label="Clear selection"
              shortcut="clear"
              apple={apple}
            >
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Clear selection (${formatLinkCount(shownCount)} selected)`}
                className="h-7 gap-1.5 rounded-lg bg-accent px-2 text-xs tabular-nums hover:bg-accent/70"
                onClick={() => linkSelection.clear()}
              >
                {shownCount} selected
                <X data-icon="inline-end" className="size-3.5" />
              </Button>
            </ShortcutTooltip>
            <BarSeparator />
            <ShortcutTooltip
              label={allSelected ? "Deselect all" : "Select all"}
              shortcut={allSelected ? undefined : "selectAll"}
              apple={apple}
            >
              {/* The list's master checkbox: partly checked (some selected)
                  or checked (all), drawn like the rows' checkboxes. */}
              <Button
                variant="ghost"
                size="sm"
                role="checkbox"
                aria-checked={allSelected ? true : "mixed"}
                aria-label="Select all"
                // Icon-only on phones, where the full bar wouldn't fit.
                className="rounded-lg text-muted-foreground hover:text-foreground max-sm:w-8 max-sm:px-0"
                onClick={toggleAll}
              >
                <MasterCheckbox checked={allSelected} />
                {/* Both labels share one grid cell, so the button keeps the
                    longer one's width and the bar never jumps. */}
                <Typography
                  component="span"
                  aria-hidden
                  className="grid max-sm:hidden"
                >
                  <Typography
                    component="span"
                    size="small"
                    className="invisible col-start-1 row-start-1 font-medium"
                  >
                    Deselect all
                  </Typography>
                  <Typography
                    component="span"
                    size="small"
                    className="col-start-1 row-start-1 font-medium text-current"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </Typography>
                </Typography>
              </Button>
            </ShortcutTooltip>
            <BarSeparator />
            <MoveMenu
              open={moveOpen}
              onOpenChange={setMoveOpen}
              apple={apple}
              folderOf={folderOf}
              onMove={(folderId) => void moveTo(folderId)}
              onNewFolder={() => {
                newFolderLinks.current = linkSelection.selectedIds();
                pendingNewFolder.current = true;
              }}
              onCloseAutoFocus={(event) => {
                if (!pendingNewFolder.current) return;
                pendingNewFolder.current = false;
                event.preventDefault();
                setNewFolderOpen(true);
              }}
            />
            <BarSeparator />
            <ShortcutTooltip label="Delete" shortcut="delete" apple={apple}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${formatLinkCount(shownCount)}`}
                // Muted at rest so it doesn't outweigh Move; the destructive
                // variant's colors only on hover or focus, right before a click.
                className="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:ring-destructive dark:hover:bg-destructive/20 dark:focus-visible:bg-destructive/20"
                onClick={deleteSelected}
              >
                <Trash />
              </Button>
            </ShortcutTooltip>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * The Select all control's box: a dash while only some links are selected,
 * the rows' checked fill once all are. Decorative; the button carries the
 * checkbox role and state.
 */
function MasterCheckbox({ checked }: { checked: boolean }) {
  return (
    <Typography
      component="span"
      aria-hidden
      data-icon="inline-start"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150 ease-out [&_svg]:size-3.5",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input text-foreground dark:bg-input/30",
      )}
    >
      {checked ? <Check /> : <Minus />}
    </Typography>
  );
}

function BarSeparator() {
  return <div aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />;
}

/** A tooltip naming the action, with its shortcut in a `Kbd`. */
function ShortcutTooltip({
  label,
  shortcut,
  apple,
  children,
}: {
  label: string;
  shortcut?: SelectionShortcut;
  apple: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
        {shortcut ? (
          <Kbd>{selectionShortcutLabel(shortcut, { apple })}</Kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Move menu, opening upward from the bar: every folder (the current one
 * checked and disabled on a folder page), "Remove from …" when the selected
 * links are in a folder, and "New folder…".
 */
function MoveMenu({
  open,
  onOpenChange,
  apple,
  folderOf,
  onMove,
  onNewFolder,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apple: boolean;
  folderOf: (linkId: string) => string | null | undefined;
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { folders, max } = useFolders();
  const currentFolder = useCurrentFolder();
  const selectedIds = useSelectedLinkIds();
  const atCap = folders.length >= max;
  const anyFiled =
    currentFolder !== null ||
    Array.from(selectedIds).some((id) => Boolean(folderOf(id)));

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <ShortcutTooltip label="Move to folder" shortcut="move" apple={apple}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-lg">
            <FolderInput data-icon="inline-start" />
            Move
            <ChevronUp
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        </DropdownMenuTrigger>
      </ShortcutTooltip>
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-60"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {/* Only the folders scroll; 7.5 rows tall so the half-visible last
            row shows that it scrolls. */}
        {folders.length > 0 ? (
          <DropdownMenuGroup className="max-h-60 overflow-y-auto overscroll-y-contain">
            {folders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                current={folder.id === currentFolder?.id}
                onSelect={() => onMove(folder.id)}
              />
            ))}
          </DropdownMenuGroup>
        ) : null}
        {folders.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuGroup>
          {anyFiled ? (
            <DropdownMenuItem onSelect={() => onMove(null)}>
              <FolderMinus />
              <Typography
                component="span"
                size="small"
                className="min-w-0 truncate text-foreground"
              >
                {currentFolder
                  ? `Remove from ${currentFolder.name}`
                  : "Remove from folders"}
              </Typography>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={atCap} onSelect={onNewFolder}>
            <FolderPlus />
            <Typography
              component="span"
              size="small"
              className="min-w-0 truncate text-foreground"
            >
              {atCap ? `Folder limit reached (${max})` : "New folder…"}
            </Typography>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderRow({
  folder,
  current,
  onSelect,
}: {
  folder: FolderSummary;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem disabled={current} onSelect={onSelect}>
      <FolderEmoji emoji={folder.emoji} />
      <Typography
        component="span"
        size="small"
        className="min-w-0 flex-1 truncate text-foreground"
      >
        {folder.name}
      </Typography>
      {current ? <Check aria-hidden="true" /> : null}
    </DropdownMenuItem>
  );
}
