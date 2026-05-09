"use client";

import { PricingCard } from "@/components/pricing-card";
import { useSession } from "@/lib/auth-client";
import { publicPlans } from "@/lib/plans";
import { useCallback, useState } from "react";
import { toast } from "sonner";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PricingPlans() {
  const { data: session } = useSession();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Checkout failed");
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  }, [interval]);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        className="inline-flex rounded-full border border-border bg-muted/40 p-1"
        role="group"
        aria-label="Billing period"
      >
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === "month"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
          onClick={() => setInterval("month")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === "year"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
          onClick={() => setInterval("year")}
        >
          Annual
        </button>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 md:flex-row">
        {publicPlans.map((plan) => {
          if (plan.id === "FREE") {
            return (
              <PricingCard
                key={plan.id}
                name={plan.name}
                description={plan.description}
                price={plan.priceLabel}
                priceSubLabel={plan.priceSubLabel}
                features={plan.features}
                actionText={plan.actionText}
                popular={plan.popular}
                ctaHref={session?.user ? "/home" : "/signup"}
              />
            );
          }
          const monthly = plan.monthlyAmountCents ?? 0;
          const annual = plan.annualAmountCents ?? monthly * 12;
          const priceDisplay =
            interval === "month"
              ? formatMoney(monthly)
              : formatMoney(annual);
          const sub =
            interval === "month" ? "/month" : "/year (~17% vs monthly)";
          return (
            <PricingCard
              key={plan.id}
              name={plan.name}
              description={plan.description}
              price={priceDisplay}
              priceSubLabel={sub}
              features={plan.features}
              actionText={
                session?.user ? plan.actionText : `${plan.actionText} →`
              }
              popular={plan.popular}
              ctaHref={session?.user ? undefined : "/signup?next=upgrade"}
              ctaLoading={checkoutLoading}
              onCtaClick={session?.user ? startCheckout : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
