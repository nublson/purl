import { Link as LinkType } from "@/utils/links";
import { Link, MessageCircle, Pencil, Trash } from "lucide-react";
import Image from "next/image";
import { ActionButton } from "./link-action-button";
import { Typography } from "./typography";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

export function LinkItem({ link }: { link: LinkType }) {
  return (
    <Item
      key={link.url}
      role="listitem"
      className="p-2 gap-4 grid grid-cols-[20px_1fr_auto] relative hover:bg-accent"
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0"
      />
      <ItemMedia variant="image" className="size-5 rounded">
        <Image
          src={link.favicon}
          alt={link.title}
          width={20}
          height={20}
          className="aspect-square object-contain"
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Typography
            size="small"
            className="text-accent-foreground font-medium line-clamp-1 break-all"
          >
            {link.title}
          </Typography>
          <Typography
            size="small"
            className="font-normal text-muted-foreground"
          >
            {link.domain}
          </Typography>
        </ItemTitle>
      </ItemContent>
      <ItemActions className="z-10 opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
        <ActionButton
          icon={<MessageCircle />}
          tooltipText="Chat about this"
          disabled
        />
        <ActionButton icon={<Link />} tooltipText="Copy link" disabled />
        <ActionButton icon={<Pencil />} tooltipText="Edit" disabled />
        <ActionButton icon={<Trash />} tooltipText="Delete" disabled />
      </ItemActions>
    </Item>
  );
}
