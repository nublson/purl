import { getUrlDomain } from "@/utils/formatter";
import { Link, MessageCircle, Pencil, Trash } from "lucide-react";
import Image from "next/image";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

export function LinkItem({
  link,
}: {
  link: {
    favicon: string;
    title: string;
    url: string;
  };
}) {
  return (
    <Item key={link.url} asChild role="listitem" className="p-2 gap-4">
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        <ItemMedia variant="image" className="size-5 rounded-none">
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
              {getUrlDomain(link.url)}
            </Typography>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="icon-sm">
            <MessageCircle />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <Link />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <Trash />
          </Button>
        </ItemActions>
      </a>
    </Item>
  );
}
