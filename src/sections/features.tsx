import {
  default as FeaturesGrid,
  type Feature,
} from "@/components/features-grid";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";
import featuresData from "@/data/features.json";

import {
  Clock3,
  Link2,
  Lock,
  Mail,
  MessageSquareText,
  ScrollText,
} from "lucide-react";

const featureIcons = {
  Clock3,
  Link2,
  Lock,
  Mail,
  MessageSquareText,
  ScrollText,
} as const;

type FeatureIconName = keyof typeof featureIcons;
type FeatureData = Omit<Feature, "icon"> & { icon: FeatureIconName };

const features: Feature[] = (featuresData as FeatureData[]).map((feature) => ({
  ...feature,
  icon: featureIcons[feature.icon],
}));

export default function FeaturesSection() {
  return (
    <SectionWrapper>
      <div className="w-full flex flex-col items-center justify-start gap-8">
        <SectionTitle
          data={{
            label: "Features",
            title: "Everything in one quiet place.",
            description:
              "No folders. No tags. No friction. Just save it and ask later.",
          }}
          align="center"
        />
        <FeaturesGrid features={features} />
      </div>
    </SectionWrapper>
  );
}
