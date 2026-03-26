import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";

export default function FeaturesSection() {
  return (
    <SectionWrapper>
      <div>
        <SectionTitle
          data={{
            label: "Features",
            title: "Everything in one quiet place.",
            description:
              "No folders. No tags. No friction. Just save it and ask later.",
          }}
          align="center"
        />
      </div>
    </SectionWrapper>
  );
}
