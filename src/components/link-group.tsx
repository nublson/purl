import { LinkItem } from "./link-item";
import { Typography } from "./typography";
import { ItemGroup } from "./ui/item";

export const LinkGroup = ({
  label,
  links,
}: {
  label: string;
  links: {
    favicon: string;
    title: string;
    url: string;
    createdAt: Date;
  }[];
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
        {links.map((link) => (
          <LinkItem key={link.url} link={link} />
        ))}
      </ItemGroup>
    </div>
  );
};
