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
  children: React.ReactNode;
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
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn(
          "gap-4 px-0 z-51",
          content && "flex min-h-0 flex-col overflow-hidden",
          className,
        )}
      >
        <DialogHeader className="shrink-0 px-6">
          <DialogTitle className="text-lg font-medium">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {content ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {content}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
