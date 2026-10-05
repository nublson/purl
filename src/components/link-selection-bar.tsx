"use client";

import {
  useCurrentFolder,
  useFolderActions,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { formatFolderLabel, formatLinkCount } from "@/lib/folder-display";
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
import { isLinkRead, setLinksRead, useLinkReadOverrides } from "@/lib/link-read-state";
import type { Link } from "@/utils/links";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
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
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { DialogFolderForm } from "./dialog-folder-form";
import { FolderEmoji } from "./folder-emoji";
import { ReadToggleIcon } from "./read-toggle-icon";
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

const loadMotionFeatures = () =>
  import("@/lib/motion-features").then((mod) => mod.default);

/**
 * Touch screens (tablets, phones) get finger-sized controls: 40px instead
 * of the mouse's 32px, plus 2px of invisible hit area all round (`after:`),
 * so each target is 44px. The bar's 4px gaps keep neighbors' extensions
 * from overlapping. Mouse and trackpad keep the compact bar.
 */
const TOUCH_TARGET =
  "relative after:absolute after:-inset-0.5 pointer-coarse:h-10";
const TOUCH_ICON_TARGET =
  "relative after:absolute after:-inset-0.5 pointer-coarse:size-10";

/**
 * Floating bar for the selected links (Home or a folder page): the count
 * (which clears the selection), Select all / Deselect all, Move (folders,
 * "Remove from …", "New folder…") and Delete, each with its shortcut in the
 * tooltip. Shown while anything is selected.
 *
 * `folderOf` gives a loaded link's folder id (null when unfiled), so Move
 * on Home only offers "Remove from folders" when a selected link is in one.
 * `linkOf` gives a loaded link, so Mark read turns into Mark unread once
 * every selected link is read.
 */
export function LinkSelectionBar({
  folderOf,
  linkOf,
}: {
  folderOf: (linkId: string) => string | null | undefined;
  linkOf: (linkId: string) => Link | undefined;
}) {
  const selectedIds = useSelectedLinkIds();
  const readOverrides = useLinkReadOverrides();
  const allRead =
    selectedIds.size > 0 &&
    [...selectedIds].every((id) => {
      const link = linkOf(id);
      return link ? isLinkRead(link, readOverrides) : false;
    });
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
      const result = await moveLinks(ids, folderId, {
        target,
        quietError: target !== undefined,
      });
      // Only the moved links leave the selection: ones picked while the
      // request was in flight stay selected.
      if (result.ok) linkSelection.remove(ids);
      else if (target) {
        // "New folder…": the folder exists now even though the move failed.
        toast.error(
          `Created ${formatFolderLabel(target)}, but the links weren’t moved into it. Use Move to try again.`,
        );
      }
    },
    [moveLinks],
  );

  const deleteSelected = React.useCallback(() => {
    const ids = linkSelection.selectedIds();
    if (ids.length === 0) return;
    deleteLinksWithUndo(ids, { onDeleted: notifyLinksChanged });
    linkSelection.clear();
  }, [notifyLinksChanged]);

  // Marking read keeps the selection: the rows fade back in place, and the
  // same links may be moved or marked unread next.
  const toggleReadSelected = React.useCallback(() => {
    const ids = linkSelection.selectedIds();
    if (ids.length === 0) return;
    void setLinksRead(ids, !allRead);
  }, [allRead]);

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
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      const shortcut = matchSelectionShortcut(event, {
        apple: isApplePlatform(),
      });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "clear") linkSelection.clear();
      else if (shortcut === "selectAll") linkSelection.selectAll();
      else if (shortcut === "delete") deleteSelected();
      else if (shortcut === "read") toggleReadSelected();
      else setMoveOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, deleteSelected, toggleReadSelected]);

  // Toolbar pattern: the bar is one Tab stop (the last button used, the
  // count at first), and arrow keys, Home and End move between its buttons
  // (roving tabindex, set on the elements: none of them take a tabIndex
  // prop, so React leaves it alone).
  const barShown = count > 0;
  React.useEffect(() => {
    if (!barShown) return;
    const toolbar = toolbarRef.current;
    setTabStop(toolbar, toolbarButtons(toolbar)[0]);
  }, [barShown]);
  const onToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = toolbarButtons(toolbarRef.current);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    const last = buttons.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % buttons.length
        : event.key === "ArrowLeft"
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
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
      {/* `m` + LazyMotion: the animation code loads in its own chunk. */}
      <LazyMotion features={loadMotionFeatures} strict>
        <AnimatePresence initial={false}>
          {count > 0 ? (
            <m.div
              key="link-selection-bar"
              ref={toolbarRef}
              role="toolbar"
              aria-label="Selected links"
              onKeyDown={onToolbarKeyDown}
              // Whichever button gets focus (Tab, arrows, a click) becomes
              // the bar's Tab stop.
              onFocus={(event) => {
                if (event.target instanceof HTMLButtonElement) {
                  setTabStop(toolbarRef.current, event.target);
                }
              }}
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
                // Stacked on the search field: its 1rem + 44px + an 8px gap.
                "fixed inset-x-0 bottom-[calc(4.25rem+var(--bottom-inset))] z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-xl bg-popover p-1 text-popover-foreground",
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
                  // Starts with what it shows, so voice control's "tap 2
                  // selected" finds it.
                  aria-label={`${shownCount} selected, clear selection`}
                  className={cn(
                    "h-7 gap-1.5 rounded-lg bg-accent px-2 text-xs tabular-nums hover:bg-accent/70",
                    // Touch: the bar's readout at its buttons' size and type.
                    "pointer-coarse:px-3 pointer-coarse:text-sm",
                    TOUCH_TARGET,
                  )}
                  onClick={() => linkSelection.clear()}
                >
                  {/* One inline run, so "3 selected" keeps its real space.
                      The narrowest touch phones (under 23rem, e.g. 320px)
                      can't fit the word beside the bar's 40px controls:
                      the count and ✕ alone; the name still starts with it. */}
                  <Typography
                    component="span"
                    size="small"
                    // The chip's own type: 12px, 14px on touch.
                    className="text-xs leading-[inherit] text-current pointer-coarse:text-sm"
                  >
                    {shownCount}
                    <Typography
                      component="span"
                      size="small"
                      className="text-[length:inherit] leading-[inherit] text-current max-[23rem]:pointer-coarse:hidden"
                    >
                      {" "}
                      selected
                    </Typography>
                  </Typography>
                  <X data-icon="inline-end" className="size-3.5 pointer-coarse:size-4" />
                </Button>
              </ShortcutTooltip>
              <BarSeparator />
              <ShortcutTooltip
                label={allSelected ? "Deselect all" : "Select all"}
                shortcut={allSelected ? undefined : "selectAll"}
                apple={apple}
              >
                {/* The list's master checkbox: partly checked (some selected)
                    or checked (all), drawn like the rows' checkboxes. Its
                    label stays "Select all" (the box shows the state, and
                    pressing a checked box clears it, like any checkbox), so
                    the visible label always matches its name. */}
                <Button
                  variant="ghost"
                  size="sm"
                  role="checkbox"
                  aria-checked={allSelected ? true : "mixed"}
                  aria-label="Select all"
                  // Icon-only on phones, where the full bar wouldn't fit.
                  className={cn(
                    "rounded-lg text-muted-foreground hover:text-foreground max-sm:w-8 max-sm:px-0 max-sm:pointer-coarse:w-10",
                    TOUCH_TARGET,
                  )}
                  onClick={toggleAll}
                >
                  <MasterCheckbox checked={allSelected} />
                  <Typography
                    component="span"
                    size="small"
                    aria-hidden
                    className="font-medium text-current max-sm:hidden"
                  >
                    Select all
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
              <ShortcutTooltip
                label={allRead ? "Mark as unread" : "Mark as read"}
                shortcut="read"
                apple={apple}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-cy="selection-toggle-read"
                  aria-label={`Mark ${formatLinkCount(shownCount)} as ${allRead ? "unread" : "read"}`}
                  className={cn("rounded-lg", TOUCH_ICON_TARGET)}
                  onClick={toggleReadSelected}
                >
                  <ReadToggleIcon read={allRead} />
                </Button>
              </ShortcutTooltip>
              <BarSeparator />
              <ShortcutTooltip label="Delete" shortcut="delete" apple={apple}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${formatLinkCount(shownCount)}`}
                  // Muted at rest so it doesn't outweigh Move; the destructive
                  // variant's colors only on hover or focus, right before a click.
                  className={cn(TOUCH_ICON_TARGET, "rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:ring-destructive dark:hover:bg-destructive/20 dark:focus-visible:bg-destructive/20")}
                  onClick={deleteSelected}
                >
                  <Trash />
                </Button>
              </ShortcutTooltip>
            </m.div>
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </>
  );
}

/** The toolbar's enabled buttons, in order. */
function toolbarButtons(toolbar: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(
    toolbar?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  );
}

/** Makes `active` the toolbar's one Tab stop (roving tabindex). */
function setTabStop(
  toolbar: HTMLElement | null,
  active: HTMLButtonElement | undefined,
) {
  for (const button of toolbarButtons(toolbar)) {
    button.tabIndex = button === active ? 0 : -1;
  }
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
          <Button
            variant="ghost"
            size="sm"
            aria-label="Move"
            // Icon-only below 23rem, where the full bar (330px) no longer
            // fits beside the margins and Delete would be pushed off; on
            // touch phones too, where the bar's bigger controls need the
            // room.
            className={cn(
              "rounded-lg max-[23rem]:w-8 max-[23rem]:px-0 max-[23rem]:pointer-coarse:w-10 max-sm:pointer-coarse:w-10 max-sm:pointer-coarse:px-0",
              TOUCH_TARGET,
            )}
          >
            <FolderInput data-icon="inline-start" />
            <Typography
              component="span"
              size="small"
              className="font-medium text-current max-[23rem]:hidden max-sm:pointer-coarse:hidden"
            >
              Move
            </Typography>
            <ChevronUp
              data-icon="inline-end"
              className="text-muted-foreground max-[23rem]:hidden max-sm:pointer-coarse:hidden"
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
