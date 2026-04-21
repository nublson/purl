"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Link } from "@/utils/links";
import { Search } from "lucide-react";
import * as React from "react";
import { LinkItem } from "./link-item";
import { Button } from "./ui/button";

function normalizeLinks(links: Link[]): Link[] {
  return links.map((l) => ({
    ...l,
    ingestStatus: l.ingestStatus ?? "COMPLETED",
    createdAt:
      l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt),
  }));
}

function linkSearchValue(link: Link): string {
  return [link.title, link.domain, link.url, link.description ?? ""]
    .join(" ")
    .toLowerCase();
}

export default function SearchLinks({ links: linksProp }: { links: Link[] }) {
  const [open, setOpen] = React.useState(false);

  const links = React.useMemo(() => normalizeLinks(linksProp), [linksProp]);

  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label="Search links"
        onClick={() => setOpen(true)}
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer text-muted-foreground"
      >
        <Search />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        className="sm:max-w-2xl"
        title="Search links"
        description="Filter your saved links by title, URL, or domain"
      >
        <Command className="gap-0 p-0">
          <CommandInput
            placeholder="Search links..."
            wrapperClassName="p-0 border-b"
            inputGroupClassName="h-10! px-3.5 rounded-t-xl rounded-b-none border-none bg-transparent shadow-none focus-within:border-none focus-within:ring-0 dark:bg-transparent *:data-[slot=input-group-addon]:p-0!"
            className="h-full border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          <CommandList className="max-h-96">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup className="p-1.5">
              {links.map((link) => (
                <CommandItem
                  key={link.id}
                  value={linkSearchValue(link)}
                  className="mb-0.5 cursor-pointer p-0 [&>svg]:hidden"
                >
                  <LinkItem
                    link={link}
                    key={link.id}
                    preview
                    className="w-full border-0 bg-transparent shadow-none hover:bg-transparent"
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
