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
}

export function DropdownWrapper({
  trigger,
  children,
  ...props
}: DropdownWrapperProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer" asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        {...props}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          props.onCloseAutoFocus?.(event);
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
