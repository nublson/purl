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
      {proPlan ? (
        <PricingCard
          name={proPlan.name}
          description={proPlan.description}
          price={proPlan.priceLabel}
          priceSubLabel={proPlan.priceSubLabel}
          features={proPlan.features}
          actionText={loading ? "Redirecting…" : "Try for free"}
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
          className="w-full rounded-lg border border-primary/30 bg-primary/5 px-6 py-6"
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
      className="min-w-sm md:min-w-lg max-h-[90vh] md:max-h-none"
    >
      {children}
    </DialogWrapper>
  );
};
