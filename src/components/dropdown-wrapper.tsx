"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface DropdownWrapperProps extends React.ComponentProps<
  typeof DropdownMenuContent
> {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Controlled open state (optional; uncontrolled when omitted). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownWrapper({
  trigger,
  children,
  open,
  onOpenChange,
  ...props
}: DropdownWrapperProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger className="cursor-pointer" asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent {...props}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
