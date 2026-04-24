import { ContentTypeProps } from "@/sections/content-type";
import ContentTypeItem from "./content-type-item";
import { Typography } from "./typography";
import { ItemGroup } from "./ui/item";

interface ContentTypeGroupProps {
  contentTypes: ContentTypeProps[];
}

export default function ContentTypeGroup({
  contentTypes,
}: ContentTypeGroupProps) {
  return (
    <ItemGroup role="none" className="w-full lg:max-w-lg">
      {contentTypes.map((contentType) => (
        <ContentTypeItem key={contentType.type} contentType={contentType} />
      ))}
      <Typography size="mini" className="text-muted-foreground">
        Extractions and transcriptions are AI-powered features that require an
        OpenAI API key.
      </Typography>
    </ItemGroup>
  );
}
