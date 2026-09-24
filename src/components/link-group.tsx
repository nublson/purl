import { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkItem } from "./link-item";
import { ItemGroup } from "./ui/item";

interface LinkGroupProps {
  label: string;
  links: Link[];
  newLinkId?: string | null;
  prependItems?: ReactNode;
  eagerFirstLinkFavicon?: boolean;
  mode?: "default" | "search";
}

export const LinkGroup = ({
  label,
  links,
  prependItems,
  eagerFirstLinkFavicon = false,
  mode = "default",
}: LinkGroupProps) => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-4">
      <p className="text-xs text-muted-foreground font-medium ml-2">{label}</p>
      <ItemGroup className="w-full gap-0">
        {prependItems}
        {links.map((link, index) => (
          // content-visibility skips layout/paint for off-screen rows; the
          // intrinsic size (one row) keeps the scrollbar stable.
          <div
            key={link.id}
            className="[content-visibility:auto] [contain-intrinsic-size:auto_50px]"
          >
            <LinkItem
              link={link}
              mode={mode}
              eagerFavicon={eagerFirstLinkFavicon && index === 0}
            />
          </div>
        ))}
      </ItemGroup>
    </div>
  );
};
