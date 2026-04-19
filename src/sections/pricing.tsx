import { PricingCard } from "@/components/pricing-card";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";
import pricingJson from "@/data/pricing.json" with { type: "json" };

export const PricingSection = () => {
  return (
    <SectionWrapper id="pricing">
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "Pricing",
            title: (
              <>
                Everything free. <br />
                AI powered by you.
              </>
            ),
            description:
              "Save and organize unlimited links, PDFs, and more — for free. Add your OpenAI API key to unlock AI features.",
          }}
        />
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          {pricingJson.plans.map((plan) => (
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
