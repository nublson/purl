"use client";

import type { FolderSummary } from "@/lib/folders";
import { haptic } from "@/lib/haptics";
import { MotionConfig, Reorder, useDragControls } from "motion/react";
import * as React from "react";

/**
 * Rows making way: a quick, unbouncy spring (a dropdown's budget, and it
 * retargets smoothly as the drag moves on), not Motion's 450ms default.
 * The lift shadow fades in briefly instead of repainting for longer.
 */
const ROW_TRANSITION = {
  layout: { type: "spring", duration: 0.25, bounce: 0 },
  boxShadow: { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
} as const;

/**
 * A dragged row stays within the folder list: past its edges it gives only
 * a little (rising friction, not a hard stop), and on release it springs
 * back near-critically damped (2·√600 ≈ 49), quickly and without bouncing,
 * instead of Motion's soft default return from wherever it was let go.
 */
const DRAG_ELASTIC = 0.1;
const DRAG_TRANSITION = { bounceStiffness: 600, bounceDamping: 50 } as const;

/** Props for a row's drag handle (its grip). */
export type FolderGripProps = {
  onPointerDown: (event: React.PointerEvent) => void;
  onClick: (event: React.MouseEvent) => void;
};

/**
 * The folder menu's rows, draggable by their grips (Motion `Reorder`; this
 * module loads when the menu opens, keeping Motion's drag off first load).
 * The order changes live while dragging and is handed to `onReorder` once,
 * on the drop. `onDragActiveChange` is true from the drag's start until just
 * after its release: the menu swallows clicks meanwhile, so the release never
 * opens a folder or activates the item it lands on (Radix clicks the item
 * under a pointerup that started elsewhere).
 */
export function ReorderableFolderRows({
  folders,
  onReorder,
  renderRow,
  onDragActiveChange,
}: {
  folders: FolderSummary[];
  onReorder: (ids: string[], moved: FolderSummary) => void;
  onDragActiveChange: (active: boolean) => void;
  renderRow: (
    folder: FolderSummary,
    index: number,
    grip: FolderGripProps,
  ) => React.ReactNode;
}) {
  const [order, setOrder] = React.useState(folders);
  const [dragging, setDragging] = React.useState(false);
  // Follow the list from outside (saves, other tabs) except mid-drag.
  const [synced, setSynced] = React.useState(folders);
  if (!dragging && folders !== synced) {
    setSynced(folders);
    setOrder(folders);
  }
  // The latest order, for the drop handler (Motion's onDragEnd may run
  // before a re-render picks up the last onReorder).
  const orderRef = React.useRef(order);
  React.useLayoutEffect(() => {
    orderRef.current = order;
  });
  // The drag's bounds: the list itself.
  const listRef = React.useRef<HTMLDivElement>(null);

  function dragStarted() {
    onDragActiveChange(true);
    setDragging(true);
  }

  function dragEnded(folder: FolderSummary) {
    setDragging(false);
    // After the release's click (Motion ends the drag after pointerup).
    setTimeout(() => onDragActiveChange(false), 0);
    const ids = orderRef.current.map((f) => f.id);
    if (ids.some((id, index) => id !== folders[index]?.id)) {
      onReorder(ids, folder);
    }
  }

  return (
    // Reduced motion: the dragged row still follows the pointer, but the
    // others jump into place instead of sliding.
    <MotionConfig reducedMotion="user">
      <Reorder.Group
        ref={listRef}
        as="div"
        axis="y"
        values={order}
        onReorder={(next) => {
          orderRef.current = next;
          setOrder(next);
        }}
      >
        {order.map((folder, index) => (
          <ReorderableRow
            key={folder.id}
            folder={folder}
            constraints={listRef}
            onDragStart={dragStarted}
            onDragEnd={() => dragEnded(folder)}
          >
            {(grip) => renderRow(folder, index, grip)}
          </ReorderableRow>
        ))}
      </Reorder.Group>
    </MotionConfig>
  );
}

function ReorderableRow({
  folder,
  constraints,
  onDragStart,
  onDragEnd,
  children,
}: {
  folder: FolderSummary;
  constraints: React.RefObject<HTMLDivElement | null>;
  onDragStart: () => void;
  onDragEnd: () => void;
  children: (grip: FolderGripProps) => React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={folder}
      dragListener={false}
      dragControls={controls}
      dragConstraints={constraints}
      dragElastic={DRAG_ELASTIC}
      dragTransition={DRAG_TRANSITION}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // Above the rows it passes, on the menu's own background.
      className="relative rounded-md bg-popover"
      whileDrag={{ zIndex: 1, boxShadow: "0 6px 16px rgb(0 0 0 / 0.25)" }}
      transition={ROW_TRANSITION}
    >
      {children({
        onPointerDown: (event) => {
          if (event.button !== 0) return;
          if (event.pointerType === "touch") haptic("selection");
          controls.start(event);
        },
        // A press on the grip without a drag isn't a click on the folder.
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
      })}
    </Reorder.Item>
  );
}
