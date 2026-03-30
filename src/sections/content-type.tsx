import ContentTypeGroup from "@/components/content-type-group";
import SectionTitle from "@/components/section-title";
import SectionWrapper from "@/components/section-wrapper";
import { contentTypes as contentTypesData } from "@/data/content-types.json" with { type: "json" };
import {
  FileText,
  Headphones,
  Link,
  LucideIcon,
  TvMinimalPlay,
} from "lucide-react";

export interface ContentTypeProps {
  type: "Links" | "PDFs" | "YouTube" | "Audio";
  description: string;
  icon: LucideIcon;
  access: string;
}

const contentTypeIcons = {
  Link,
  FileText,
  TvMinimalPlay,
  Headphones,
} as const;

type ContentTypeIconName = keyof typeof contentTypeIcons;
type ContentTypeData = Omit<ContentTypeProps, "icon"> & {
  icon: ContentTypeIconName;
};

const contentTypes: ContentTypeProps[] = (
  contentTypesData as ContentTypeData[]
).map((contentType) => ({
  ...contentType,
  icon: contentTypeIcons[contentType.icon],
}));

export default function ContentTypeSection() {
  return (
    <SectionWrapper>
      <div className="w-full flex flex-col lg:flex-row items-start justify-between gap-8">
        <SectionTitle
          data={{
            label: "Content Types",
            title: "More than just links.",
            description:
              "Purl handles every format you throw at it — and makes it all searchable and conversational.",
          }}
          align="left"
        />

        <ContentTypeGroup
          contentTypes={contentTypes as unknown as ContentTypeProps[]}
        />
      </div>
    </SectionWrapper>
  );
}
