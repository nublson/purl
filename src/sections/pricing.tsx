import { PricingCard } from "@/components/pricing-card";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";

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
          <PricingCard
            title="Free"
            description="Everything you need to start building your personal knowledge base."
            price="0"
            features={[
              "Unlimited savings",
              "5 Pdfs per month",
              "AI chat (limited)",
            ]}
            actionText="Get started free"
          />
        </div>
      </div>
    </SectionWrapper>
  );
};
