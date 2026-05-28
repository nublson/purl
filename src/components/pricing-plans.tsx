"use client";

import { PricingCard } from "@/components/pricing-card";
import { useSession } from "@/lib/auth-client";
import { publicPlans } from "@/lib/plans";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function PricingPlans() {
  const { data: session } = useSession();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
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
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-6">
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
          return (
            <PricingCard
              key={plan.id}
              name={plan.name}
              description={plan.description}
              price={plan.priceLabel}
              priceSubLabel={plan.priceSubLabel}
              features={plan.features}
              actionText={
                session?.user ? "Upgrade to Pro" : `${plan.actionText} →`
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
