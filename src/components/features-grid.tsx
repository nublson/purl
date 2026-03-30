import { ItemGroup } from "@/components/ui/item";
import { LucideIcon } from "lucide-react";
import FeatureItem from "./feature-item";

export type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function FeaturesGrid({ features }: { features: Feature[] }) {
  return (
    <ItemGroup className="grid grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-border bg-transparent md:grid-cols-2 lg:grid-cols-3">
      {features.map((feature, index) => (
        <FeatureItem
          key={feature.title}
          feature={feature}
          index={index}
          length={features.length}
        />
      ))}
    </ItemGroup>
  );
}
