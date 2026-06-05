"use client";

import { Typography } from "@/components/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCheckout } from "@/hooks/use-checkout";
import { useUsage } from "@/hooks/use-usage";
import { PRO_ONETIME_PRICE_CENTS } from "@/lib/plans";
import { Sparkles } from "lucide-react";
import Link from "next/link";

const price = `$${PRO_ONETIME_PRICE_CENTS / 100}`;

export function UpgradeCard() {
  const { startCheckout, loading } = useCheckout();
  const { usageSummary } = useUsage();
  const isTrial = usageSummary?.effectivePlanKey === "PRO_TRIAL";
  const ctaLabel = loading ? "Redirecting…" : isTrial ? "Upgrade" : "Try for free";

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <Typography
            size="small"
            className="font-semibold text-accent-foreground"
          >
            Upgrade to Pro
          </Typography>
          <Badge variant="secondary">{price} one-time</Badge>
        </div>
        <Typography size="small" className="text-muted-foreground">
          Unlock AI extraction, semantic search, unlimited saves, and 300 chat
          messages per month.
        </Typography>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={() => void startCheckout()}
            disabled={loading}
          >
            {ctaLabel}
          </Button>
          <Button size="sm" variant="ghost" className="cursor-pointer" asChild>
            <Link href="/#pricing">Learn more</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
