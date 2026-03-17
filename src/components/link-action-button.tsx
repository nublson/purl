"use client";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ActionButtonProps = {
  icon: React.ReactNode;
  tooltipText: string;
} & Omit<React.ComponentPropsWithoutRef<typeof Button>, "children">;

export function ActionButton({
  icon,
  tooltipText,
  ...buttonProps
}: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-muted-foreground"
          {...buttonProps}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
