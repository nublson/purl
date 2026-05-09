"use client";

import { DialogWrapper } from "./dialog-wrapper";
import { PricingCard } from "./pricing-card";
import { Typography } from "./typography";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useSession } from "@/lib/auth-client";
import { publicPlans } from "@/lib/plans";
import * as React from "react";
import { toast } from "sonner";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface UpgradeDialogProps {
  children: React.ReactNode;
}

export const UpgradeDialog = ({ children }: UpgradeDialogProps) => {
  const { data: session } = useSession();
  const [interval, setInterval] = React.useState<"month" | "year">("month");
  const [loading, setLoading] = React.useState<string | null>(null);

  const proPlan = publicPlans.find((p) => p.id === "PRO");
  const freePlan = publicPlans.find((p) => p.id === "FREE");

  const startCheckout = async () => {
    if (!session?.user) {
      toast.error("Please sign in to upgrade.");
      return;
    }
    setLoading("checkout");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
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
      setLoading(null);
    }
  };

  const openPortal = async () => {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok)
        throw new Error(data.error ?? "Could not open billing portal");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No portal URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Portal failed");
    } finally {
      setLoading(null);
    }
  };

  const monthly = proPlan?.monthlyAmountCents ?? 0;
  const annual = proPlan?.annualAmountCents ?? monthly * 12;

  const loadingBusy = loading !== null;

  function planCardsForBilling(billing: "month" | "year") {
    const priceDisplay =
      billing === "month" ? formatMoney(monthly) : formatMoney(annual);
    const priceSubLabel =
      billing === "month" ? "/month" : "/year (~17% vs monthly)";
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-center">
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
            className="h-full min-h-0 w-full rounded-lg border border-border bg-card/40 px-6 py-6 sm:max-w-none sm:flex-1 sm:w-0! md:w-full!"
          />
        ) : null}
        {proPlan ? (
          <PricingCard
            key={proPlan.id}
            name={proPlan.name}
            description={proPlan.description}
            price={priceDisplay}
            priceSubLabel={priceSubLabel}
            features={proPlan.features}
            actionText={
              loading === "checkout" ? "Redirecting…" : "Subscribe to Pro"
            }
            popular={proPlan.popular}
            onCtaClick={session?.user ? () => void startCheckout() : undefined}
            ctaLoading={loadingBusy}
            secondaryAction={
              session?.user
                ? {
                    text: "Manage subscription",
                    onClick: () => void openPortal(),
                    loading: loading === "portal",
                  }
                : undefined
            }
            footer={
              session?.user ? undefined : (
                <Typography size="small" className="text-muted-foreground">
                  Sign in to upgrade.
                </Typography>
              )
            }
            className="h-full min-h-0 w-full rounded-lg border border-primary/30 bg-primary/5 px-6 py-6 sm:max-w-none sm:flex-1 sm:w-0! md:w-full!"
          />
        ) : null}
      </div>
    );
  }

  const content = (
    <div className="flex flex-col gap-4 px-6 pb-6">
      <Tabs
        value={interval}
        onValueChange={(v) => {
          if (v === "month" || v === "year") {
            setInterval(v);
          }
        }}
      >
        <TabsList
          className="mx-auto w-fit gap-1 rounded-full border border-border bg-muted/40 p-1"
          aria-label="Billing period"
        >
          <TabsTrigger value="month" className="rounded-full px-3 py-1 text-xs">
            Monthly
          </TabsTrigger>
          <TabsTrigger value="year" className="rounded-full px-3 py-1 text-xs">
            Annual
          </TabsTrigger>
        </TabsList>
        <TabsContent value="month" className="mt-4 flex flex-col outline-none">
          {planCardsForBilling("month")}
        </TabsContent>
        <TabsContent value="year" className="mt-4 flex flex-col outline-none">
          {planCardsForBilling("year")}
        </TabsContent>
      </Tabs>
      <Typography size="mini" className="text-center text-muted-foreground">
        New accounts get a 7-day Pro trial (no card). Subscribe anytime to keep
        Pro after the trial.
      </Typography>
    </div>
  );

  return (
    <DialogWrapper
      title="Plans & billing"
      description="Upgrade for full AI ingest, semantic search, and unlimited chat."
      content={content}
      className="md:min-w-3xl"
    >
      {children}
    </DialogWrapper>
  );
};
