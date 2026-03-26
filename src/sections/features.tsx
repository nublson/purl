import {
  default as FeaturesGrid,
  type Feature,
} from "@/components/features-grid";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";

import {
  Clock3,
  Link2,
  Lock,
  Mail,
  MessageSquareText,
  ScrollText,
} from "lucide-react";

const features: Feature[] = [
  {
    title: "Save any link instantly",
    description:
      "Paste a URL or press Ctrl+V anywhere in the app. Purl fetches the title, favicon, and full content automatically.",
    icon: Link2,
  },
  {
    title: "Organized by time",
    description:
      "Today, Yesterday, Last week - your library is always in chronological order. No manual sorting ever needed.",
    icon: Clock3,
  },
  {
    title: "Ask anything with AI",
    description:
      'Ask "what did i read about X last week?" and Purl searches across all your saved content to give you a real answer.',
    icon: MessageSquareText,
  },
  {
    title: "Deep PDF understanding",
    description:
      "Upload a PDF and ask questions about it. Purl reads the full document and surfaces exactly what you need.",
    icon: ScrollText,
  },
  {
    title: "Collections",
    description:
      "Group related content into named collections. Purl can suggest where new saves belong automatically.",
    icon: Lock,
  },
  {
    title: "Weekly digest",
    description:
      "A smart summary of what you saved this week, what's worth revisiting, and what you might have missed.",
    icon: Mail,
  },
];

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
