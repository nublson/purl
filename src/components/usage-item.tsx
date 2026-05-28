"use client";

import { Typography } from "@/components/typography";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemTitle } from "./ui/item";

export type UsageMeterData = {
  effectivePlanKey: string;
  trialEndsAt: Date | null;
  saves: { used: number; cap: number | null };
  chatMessages: { used: number; cap: number | null; windowDays: number | null };
  extractions: { used: number; cap: number | null };
};

export type UsageItemProps = {
  label: string;
  period?: string;
  used: number;
  cap: number | null;
};

export function UsageItem({ label, period, used, cap }: UsageItemProps) {
  const pct = cap != null && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <Item className="px-0">
      <ItemContent>
        <ItemTitle>
          {label}
          {period && <Badge variant="secondary">/{period}</Badge>}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <Typography component="span" size="mini">
          {used} / {cap == null ? "∞" : cap}
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
