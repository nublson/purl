"use client";

import type { FolderSummary } from "@/lib/folders";
import { haptic } from "@/lib/haptics";
import { Reorder, useDragControls } from "motion/react";
import * as React from "react";

/** Props for a row's drag handle (its grip). */
export type FolderGripProps = {
  onPointerDown: (event: React.PointerEvent) => void;
  onClick: (event: React.MouseEvent) => void;
};

/**
 * The folder menu's rows, draggable by their grips (Motion `Reorder`; this
 * module loads when the menu opens, keeping Motion's drag off first load).
 * The order changes live while dragging and is handed to `onReorder` once,
 * on the drop. A drag never opens the folder it started or ended on.
 */
export function ReorderableFolderRows({
  folders,
  onReorder,
  renderRow,
}: {
  folders: FolderSummary[];
  onReorder: (ids: string[], moved: FolderSummary) => void;
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
  // Set from the drag's start until just after its release, so the click
  // that ends it (on any row) doesn't navigate or close the menu.
  const suppressClicks = React.useRef(false);

  function dragStarted() {
    suppressClicks.current = true;
    setDragging(true);
  }

  function dragEnded(folder: FolderSummary) {
    setDragging(false);
    setTimeout(() => {
      suppressClicks.current = false;
    }, 0);
    const ids = orderRef.current.map((f) => f.id);
    if (ids.some((id, index) => id !== folders[index]?.id)) {
      onReorder(ids, folder);
    }
  }

  return (
    <Reorder.Group
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
          onDragStart={dragStarted}
          onDragEnd={() => dragEnded(folder)}
          suppressClicks={suppressClicks}
        >
          {(grip) => renderRow(folder, index, grip)}
        </ReorderableRow>
      ))}
    </Reorder.Group>
  );
}

function ReorderableRow({
  folder,
  onDragStart,
  onDragEnd,
  suppressClicks,
  children,
}: {
  folder: FolderSummary;
  onDragStart: () => void;
  onDragEnd: () => void;
  suppressClicks: React.RefObject<boolean>;
  children: (grip: FolderGripProps) => React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={folder}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // Above the rows it passes, on the menu's own background.
      className="relative rounded-md bg-popover"
      whileDrag={{ zIndex: 1, boxShadow: "0 6px 16px rgb(0 0 0 / 0.25)" }}
      onClickCapture={(event) => {
        if (!suppressClicks.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
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
