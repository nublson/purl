import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";

export const AskPurlSection = () => {
  return (
    <SectionWrapper>
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "Ask Purl",
            title: "Ask anything about your saved content.",
            description:
              "Type a question in plain English. Purl searches across everything you've saved — articles, PDFs, videos — and gives you a real, synthesized answer with sources.",
          }}
        />
      </div>
    </SectionWrapper>
  );
};
