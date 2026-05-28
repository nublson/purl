"use client";

import { useSession } from "@/lib/auth-client";
import { publicPlans } from "@/lib/plans";
import * as React from "react";
import { toast } from "sonner";
import { DialogWrapper } from "./dialog-wrapper";
import { PricingCard } from "./pricing-card";
import { Typography } from "./typography";

interface UpgradeDialogProps {
  children: React.ReactNode;
}

export const UpgradeDialog = ({ children }: UpgradeDialogProps) => {
  const { data: session } = useSession();
  const [loading, setLoading] = React.useState(false);

  const proPlan = publicPlans.find((p) => p.id === "PRO");
  const freePlan = publicPlans.find((p) => p.id === "FREE");

  const startCheckout = async () => {
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

  const content = (
    <div className="flex min-h-0 flex-col gap-4 px-6 pb-6">
      <div className="grid grid-cols-1 gap-4 min-h-0 md:grid-cols-2">
        {freePlan ? (
          <PricingCard
            key={freePlan.id}
            name={freePlan.name}
            description={freePlan.description}
            price={freePlan.priceLabel}
            priceSubLabel={freePlan.priceSubLabel}
            features={freePlan.features}
            actionText={freePlan.actionText}
            popular={freePlan.popular}
            hideFooter
            className="h-full min-h-0 w-full min-w-0 rounded-lg border border-border bg-card/40 px-6 py-6"
          />
        ) : null}
        {proPlan ? (
          <PricingCard
            key={proPlan.id}
            name={proPlan.name}
            description={proPlan.description}
            price={proPlan.priceLabel}
            priceSubLabel={proPlan.priceSubLabel}
            features={proPlan.features}
            actionText={loading ? "Redirecting…" : "Upgrade to Pro"}
            popular={proPlan.popular}
            onCtaClick={session?.user ? () => void startCheckout() : undefined}
            ctaLoading={loading}
            footer={
              session?.user ? undefined : (
                <Typography size="small" className="text-muted-foreground">
                  Sign in to upgrade.
                </Typography>
              )
            }
            className="h-full min-h-0 w-full min-w-0 rounded-lg border border-primary/30 bg-primary/5 px-6 py-6"
          />
        ) : null}
      </div>
      <Typography size="mini" className="text-center text-muted-foreground">
        New accounts get a 7-day Pro trial (no card). Pay once to keep Pro
        after the trial.
      </Typography>
    </div>
  );

  return (
    <DialogWrapper
      title="Plans & billing"
      description="Upgrade for full AI ingest, semantic search, and unlimited chat."
      content={content}
      className="min-w-sm md:min-w-2xl lg:min-w-3xl max-h-[90vh] md:max-h-none"
    >
      {children}
    </DialogWrapper>
  );
};
