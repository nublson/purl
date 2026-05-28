"use client";

import { Typography } from "@/components/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { PRO_ONETIME_PRICE_CENTS } from "@/lib/plans";
import { Sparkles } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

const price = `$${PRO_ONETIME_PRICE_CENTS / 100}`;

export function UpgradeCard() {
  const { data: session } = useSession();
  const [loading, setLoading] = React.useState(false);

  const handleUpgrade = async () => {
    if (!session?.user) {
      toast.error("Please sign in to upgrade.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <Typography size="small" className="font-semibold">
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
            onClick={() => void handleUpgrade()}
            disabled={loading}
          >
            {loading ? "Redirecting…" : "Try for free"}
          </Button>
          <Button size="sm" variant="ghost" className="cursor-pointer" disabled>
            Learn more
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
