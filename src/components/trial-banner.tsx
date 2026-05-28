"use client";

import { Typography } from "@/components/typography";
import { Card, CardContent } from "@/components/ui/card";

function trialDaysRemaining(trialEndsAt: Date): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function TrialBanner({ trialEndsAt }: { trialEndsAt: Date | null }) {
  if (!trialEndsAt) return null;

  const daysLeft = trialDaysRemaining(new Date(trialEndsAt));

  return (
    <Card size="sm">
      <CardContent>
        <Typography size="small" className="text-muted-foreground">
          {daysLeft === 0
            ? "Your free trial ends today. Upgrade to keep AI access."
            : `Free trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining.`}
        </Typography>
      </CardContent>
    </Card>
  );
}
