"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import * as React from "react";

interface AlertDialogWrapperProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  content?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function AlertDialogWrapper({
  title,
  description,
  children,
  content,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
}: AlertDialogWrapperProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent
        size="default"
        className={cn(
          "gap-4 px-0",
          content && "flex min-h-0 flex-col overflow-hidden",
          className,
        )}
      >
        <AlertDialogHeader className="shrink-0 px-6">
          <AlertDialogTitle className="text-lg font-medium">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {content ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {content}
          </div>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
