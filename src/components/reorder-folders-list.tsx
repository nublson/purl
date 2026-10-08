"use client";

import type { FolderSummary } from "@/lib/folders";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Reorder, useDragControls } from "motion/react";
import * as React from "react";
import { ArrowDown, ArrowUp, Reorder as ReorderIcon } from "reicon-react";
import { FolderEmoji } from "./folder-emoji";
import { HapticTarget } from "./haptic-target";
import { Button } from "./ui/button";

type Direction = "up" | "down";

/** What to focus once a move has rendered: the same button, or the row. */
type PendingFocus = { id: string; target: Direction | "row" };

/**
 * The Reorder folders dialog's list, loaded on demand (it pulls in Motion's
 * drag). Rows drag by their grip only, so the list still scrolls on touch;
 * Move up / Move down and ⌥↑ / ⌥↓ do the same from the keyboard, with focus
 * following the moved row and each move announced. Changes go to
 * `onChange`; nothing is saved here.
 */
export function ReorderFoldersList({
  folders,
  onChange,
}: {
  folders: FolderSummary[];
  onChange: (next: FolderSummary[]) => void;
}) {
  const [announcement, setAnnouncement] = React.useState("");
  const listRef = React.useRef<HTMLUListElement>(null);
  const pendingFocus = React.useRef<PendingFocus | null>(null);

  React.useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-folder-id="${CSS.escape(pending.id)}"]`,
    );
    if (!row) return;
    const button =
      pending.target === "row"
        ? null
        : row.querySelector<HTMLButtonElement>(
            `[data-direction="${pending.target}"]:not(:disabled)`,
          );
    (button ?? row).focus();
  }, [folders]);

  function move(id: string, direction: Direction, focus: Direction | "row") {
    const from = folders.findIndex((folder) => folder.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= folders.length) return;
    const next = [...folders];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    pendingFocus.current = { id, target: focus };
    setAnnouncement(`${moved.name} moved to position ${to + 1} of ${next.length}`);
    onChange(next);
  }

  function announceDrop(id: string) {
    const index = folders.findIndex((folder) => folder.id === id);
    if (index === -1) return;
    setAnnouncement(
      `${folders[index].name} moved to position ${index + 1} of ${folders.length}`,
    );
  }

  return (
    <>
      <Reorder.Group
        ref={listRef}
        as="ul"
        axis="y"
        values={folders}
        onReorder={onChange}
        className="flex flex-col gap-0.5"
      >
        {folders.map((folder, index) => (
          <ReorderRow
            key={folder.id}
            folder={folder}
            index={index}
            total={folders.length}
            onMove={(direction, focus) => move(folder.id, direction, focus)}
            onDrop={() => announceDrop(folder.id)}
          />
        ))}
      </Reorder.Group>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function ReorderRow({
  folder,
  index,
  total,
  onMove,
  onDrop,
}: {
  folder: FolderSummary;
  index: number;
  total: number;
  onMove: (direction: Direction, focus: Direction | "row") => void;
  onDrop: () => void;
}) {
  const controls = useDragControls();
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <Reorder.Item
      as="li"
      value={folder}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      // Lifted while dragging, so it reads as above the rows it passes.
      whileDrag={{ boxShadow: "0 8px 24px rgb(0 0 0 / 0.25)" }}
      data-folder-id={folder.id}
      tabIndex={0}
      aria-label={`${folder.name}, position ${index + 1} of ${total}`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !event.altKey) return;
        if (event.key === "ArrowUp" && !isFirst) {
          event.preventDefault();
          onMove("up", "row");
        } else if (event.key === "ArrowDown" && !isLast) {
          event.preventDefault();
          onMove("down", "row");
        }
      }}
      // `relative` + the dialog's background: the dragged row paints over its
      // neighbours and otherwise blends in.
      className={cn(
        "relative flex items-center gap-2 rounded-md bg-popover py-1 ps-1 pe-1 outline-none select-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <span
        aria-hidden="true"
        data-reorder-grip=""
        onPointerDown={(event) => {
          if (event.pointerType === "touch") haptic("selection");
          controls.start(event);
        }}
        className="flex size-8 shrink-0 cursor-grab touch-none pointer-coarse:size-10 items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
      >
        <ReorderIcon className="size-4" />
      </span>
      <FolderEmoji emoji={folder.emoji} />
      <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
      <MoveButton
        direction="up"
        name={folder.name}
        disabled={isFirst}
        onMove={() => onMove("up", "up")}
      />
      <MoveButton
        direction="down"
        name={folder.name}
        disabled={isLast}
        onMove={() => onMove("down", "down")}
      />
    </Reorder.Item>
  );
}

function MoveButton({
  direction,
  name,
  disabled,
  onMove,
}: {
  direction: Direction;
  name: string;
  disabled: boolean;
  onMove: () => void;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-direction={direction}
      aria-label={`Move ${name} ${direction}`}
      disabled={disabled}
      onClick={(event) => {
        // A tap or click (detail > 0) ticks; Enter / Space from the keyboard don't.
        if (event.detail > 0) haptic("selection");
        onMove();
      }}
      // 40px on touch screens, like the selection bar's controls.
      className="relative shrink-0 text-muted-foreground pointer-coarse:size-10"
    >
      <Icon />
      <HapticTarget />
    </Button>
  );
}
