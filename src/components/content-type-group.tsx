import { ContentTypeProps } from "@/sections/content-type";
import ContentTypeItem from "./content-type-item";
import { ItemGroup } from "./ui/item";

interface ContentTypeGroupProps {
  contentTypes: ContentTypeProps[];
}

export default function ContentTypeGroup({
  contentTypes,
}: ContentTypeGroupProps) {
  return (
    <ItemGroup className="w-full lg:max-w-lg">
      {contentTypes.map((contentType) => (
        <ContentTypeItem key={contentType.type} contentType={contentType} />
      ))}
    </ItemGroup>
  );
}
