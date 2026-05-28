import { BelowFoldSectionSkeleton } from "@/components/skeletons";
import HeroSection from "@/sections/hero";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  description:
    "Purl is an AI-powered read-it-later app. Save links, PDFs, YouTube videos, and audio — then ask anything about what you've saved. Free 7-day trial, no card required.",
};

const FeaturesSection = dynamic(() => import("@/sections/features"), {
  loading: () => <BelowFoldSectionSkeleton />,
});

const ContentTypeSection = dynamic(() => import("@/sections/content-type"), {
  loading: () => <BelowFoldSectionSkeleton />,
});

const PricingSection = dynamic(
  () =>
    import("@/sections/pricing").then((mod) => ({
      default: mod.PricingSection,
    })),
  {
    loading: () => <BelowFoldSectionSkeleton />,
  },
);

const FAQSection = dynamic(() => import("@/sections/faq"), {
  loading: () => <BelowFoldSectionSkeleton />,
});

export default function Home() {
  return (
    <div className="w-full flex flex-col h-full items-center justify-center">
      <HeroSection />
      <FeaturesSection />
      <ContentTypeSection />
      <PricingSection />
      <FAQSection />
    </div>
  );
}
