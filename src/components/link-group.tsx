import { Link } from "@/utils/links";
import { LinkItem } from "./link-item";
import { Typography } from "./typography";
import { ItemGroup } from "./ui/item";

export const LinkGroup = ({
  label,
  links,
  prependItems,
}: {
  label: string;
  links: Link[];
  prependItems?: React.ReactNode;
}) => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-4">
      <Typography
        size="mini"
        className="text-muted-foreground font-medium ml-2"
      >
        {label}
      </Typography>
      <ItemGroup className="w-full gap-0">
        {prependItems}
        {links.map((link) => (
          <LinkItem key={link.id} link={link} />
        ))}
      </ItemGroup>
    </div>
  );
};
