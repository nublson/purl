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
      <DialogContent className={cn("gap-2 px-0", className)}>
        <DialogHeader className="px-6">
          <DialogTitle className="text-lg font-medium">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
