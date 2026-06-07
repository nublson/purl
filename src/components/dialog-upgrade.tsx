"use client";

import { useCheckout } from "@/hooks/use-checkout";
import { useUsage } from "@/hooks/use-usage";
import { useSession } from "@/lib/auth-client";
import { publicPlans } from "@/lib/plans";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { PricingCard } from "./pricing-card";
import { Typography } from "./typography";

interface UpgradeDialogProps {
  children: React.ReactNode;
}

export const UpgradeDialog = ({ children }: UpgradeDialogProps) => {
  const { data: session } = useSession();
  const { startCheckout, loading } = useCheckout();
  const { usageSummary } = useUsage();
  const isTrial = usageSummary?.effectivePlanKey === "PRO_TRIAL";
  const ctaLabel = loading
    ? "Redirecting…"
    : isTrial
      ? "Upgrade"
      : "Try for free";
  const proPlan = publicPlans.find((p) => p.id === "PRO");

  const content = (
    <div className="flex min-h-0 flex-col items-center justify-center gap-4 px-6 pb-6">
      {proPlan ? (
        <PricingCard
          name={proPlan.name}
          description={proPlan.description}
          price={proPlan.priceLabel}
          priceSubLabel={proPlan.priceSubLabel}
          features={proPlan.features}
          actionText={ctaLabel}
          popular={proPlan.popular}
          onCtaClick={session?.user ? () => void startCheckout() : undefined}
          ctaLoading={loading}
          className="bg-primary/5 p-6 max-w-96"
        />
      ) : null}
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <Typography size="small">or</Typography>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Typography size="small" className="text-center text-muted-foreground">
        Already have an Anthropic API key?{" "}
        <span className="font-medium text-foreground">
          Add it in Settings → Usage
        </span>{" "}
        to use all AI features for free.
      </Typography>
    </div>
  );

  return (
    <DialogWrapper
      title="Upgrade to Pro"
      description="Save links for free. Pay once to unlock the full AI knowledge base."
      content={content}
      className="dialog-top"
    >
      {children}
    </DialogWrapper>
  );
};
