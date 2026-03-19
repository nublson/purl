import { Link as LinkType } from "@/utils/links";
import { MessageCircle } from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { LinkMenu } from "./link-menu";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "./ui/item";
import { cn } from "@/lib/utils";

export const LinkItem = React.forwardRef<
  HTMLDivElement,
  { link: LinkType } & React.ComponentPropsWithoutRef<typeof Item>
>(function LinkItem({ link, className, ...rest }, ref) {
  return (
    <Item
      ref={ref}
      role="listitem"
      className={cn(
        "p-2 gap-4 grid grid-cols-[20px_1fr_auto] relative hover:bg-accent/40 has-data-[state=open]:bg-accent/40",
        className
      )}
      {...rest}
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
          <p className="text-accent-foreground text-sm font-medium line-clamp-1 break-all">
            {link.title}
          </p>
          <p className="text-muted-foreground text-sm font-normal hidden md:block">
            {link.domain}
          </p>
        </ItemTitle>
      </ItemContent>
      <ItemActions className="z-10 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 has-data-[state=open]:opacity-100 transition-opacity duration-200">
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-muted-foreground [@media(hover:none)]:hidden"
        >
          <MessageCircle />
        </Button>
        <LinkMenu />
      </ItemActions>
    </Item>
  );
});
