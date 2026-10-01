"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import * as React from "react";

interface DialogWrapperProps {
  /**
   * Optional trigger element. Omit it for a purely controlled dialog (pass
   * `open`/`onOpenChange`) that's opened from elsewhere, e.g. a dropdown
   * menu item whose content isn't always mounted.
   */
  children?: React.ReactNode;
  title: string;
  description?: string;
  content?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function DialogWrapper({
  title,
  description,
  children,
  content,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
}: DialogWrapperProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent
        className={cn(
          "gap-4 px-0 z-51",
          // pb-5 + the scroll area's pb-1 keep the 24px bottom inset.
          content && "flex min-h-0 flex-col overflow-hidden pb-5",
          className,
        )}
      >
        <DialogHeader className="shrink-0 px-6">
          <DialogTitle className="text-lg font-medium">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {content ? (
          // pb-1 so the footer buttons' focus ring (ring-3) isn't clipped by
          // the scroll container's edge.
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-1">
            {content}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
