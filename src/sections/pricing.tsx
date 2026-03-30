import { PricingCard } from "@/components/pricing-card";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";
import { plans } from "@/data/pricing.json" with { type: "json" };

export const PricingSection = () => {
  return (
    <SectionWrapper>
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "Pricing",
            title: "Start free. Go deeper when ready.",
            description:
              "No credit card required. Upgrade when you need more power.",
          }}
        />
        <div className="flex items-center justify-center gap-4">
          {plans.map((plan) => (
            <PricingCard
              key={plan.name}
              name={plan.name}
              description={plan.description}
              price={plan.price.toString()}
              features={plan.features}
              actionText={plan.actionText}
              popular={plan.popular}
            />
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
};
