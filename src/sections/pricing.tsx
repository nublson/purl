import { PricingPlans } from "@/components/pricing-plans";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";

export const PricingSection = () => {
  return (
    <SectionWrapper id="pricing">
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "Pricing",
            title: (
              <>
                Start free. <br />
                Upgrade when you want AI memory.
              </>
            ),
            description:
              "Save links and search them for free. Pro turns your stash into an AI knowledge base with extractions, embeddings, and unlimited chat.",
          }}
        />
        <PricingPlans />
      </div>
    </SectionWrapper>
  );
};
