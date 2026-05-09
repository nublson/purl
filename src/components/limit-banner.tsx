"use client";

import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";

export function LimitBanner({
  message,
  onDismiss,
  upgradeHref = "/#pricing",
}: {
  message: string;
  onDismiss?: () => void;
  upgradeHref?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <Typography size="small" className="text-foreground">
        {message}
      </Typography>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="default" asChild>
          <a href={upgradeHref}>Upgrade</a>
        </Button>
        {onDismiss ? (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}
