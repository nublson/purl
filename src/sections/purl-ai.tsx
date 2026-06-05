import PreviewChat from "@/components/preview-chat";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";

export const PurlAISection = () => {
  return (
    <SectionWrapper id="purl-ai">
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "Purl AI",
            title: "Ask anything. Get real answers.",
            description:
              "Ask in plain English and get a synthesized answer with sources — from everything you've saved.",
          }}
        />
        <div className="border border-border rounded-xl overflow-hidden">
          <PreviewChat />
        </div>
      </div>
    </SectionWrapper>
  );
};
