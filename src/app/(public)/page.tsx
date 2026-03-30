import { AskPurlSection } from "@/sections/ask-purl";
import ContentTypeSection from "@/sections/content-type";
import FAQSection from "@/sections/faq";
import FeaturesSection from "@/sections/features";
import HeroSection from "@/sections/hero";
import { PricingSection } from "@/sections/pricing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  description:
    "Purl is an AI-powered read-it-later app. Save any link, and Purl understands and remembers the content so you can ask questions and get answers with sources.",
};

export default function Home() {
  return (
    <div className="w-full flex flex-col h-full items-center justify-center">
      <HeroSection />
      <FeaturesSection />
      <ContentTypeSection />
      <AskPurlSection />
      <PricingSection />
      <FAQSection />
    </div>
  );
}
