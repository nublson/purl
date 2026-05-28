"use client";

import { Typography } from "@/components/typography";
import { Item, ItemActions, ItemContent, ItemTitle } from "./ui/item";

export type UsageMeterData = {
  effectivePlanKey: string;
  saves: { used: number; cap: number | null };
  chatMessages: { used: number; cap: number | null; windowDays: number | null };
  extractions: { used: number; cap: number | null };
};

export type UsageItemProps = {
  label: string;
  used: number;
  cap: number | null;
};

export function UsageItem({ label, used, cap }: UsageItemProps) {
  if (cap == null) {
    return (
      <div className="flex flex-col gap-1">
        <Typography size="mini" className="text-muted-foreground">
          {label}: {used} (Pro)
        </Typography>
      </div>
    );
  }

  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <Item className="px-0">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Typography component="span" size="mini">
          {used} / {cap}
        </Typography>
      </ItemActions>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Item>
  );
}
