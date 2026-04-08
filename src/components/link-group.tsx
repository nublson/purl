import { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkItem } from "./link-item";
import { ItemGroup } from "./ui/item";

export const LinkGroup = ({
  label,
  links,
  prependItems,
  preview,
}: {
  label: string;
  links: Link[];
  newLinkId?: string | null;
  prependItems?: ReactNode;
  preview?: boolean;
}) => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-4">
      <p className="text-xs text-muted-foreground font-medium ml-2">{label}</p>
      <ItemGroup className="w-full gap-0">
        {prependItems}
        {links.map((link) => (
          <LinkItem key={link.id} link={link} preview={preview} />
        ))}
      </ItemGroup>
    </div>
  );
};
