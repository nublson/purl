import { AccordionGroup } from "@/components/accordion-group";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";
import faqJson from "@/data/faq.json" with { type: "json" };

export default function FAQSection() {
  return (
    <SectionWrapper id="faq">
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "FAQ",
            title: "Questions, answered.",
            description:
              "How saving works, what you can ask, and how your data stays private.",
          }}
          align="center"
        />
        <AccordionGroup items={faqJson.questions} />
      </div>
    </SectionWrapper>
  );
}
