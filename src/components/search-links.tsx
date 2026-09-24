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
import { onLinksChanged } from "@/lib/links-events";
import { parseJsonLinks, type Link } from "@/utils/links";
import { Search } from "lucide-react";
import * as React from "react";
import { LinkItem } from "./link-item";
import { Button } from "./ui/button";

const SEARCH_DEBOUNCE_MS = 150;

/**
 * Header search. Results come from `/api/links/search` (capped server-side)
 * instead of shipping the whole link list to the client.
 */
export default function SearchLinks() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [links, setLinks] = React.useState<Link[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [version, setVersion] = React.useState(0);

  // Re-run the current search when links change (e.g. deleted from results).
  React.useEffect(
    () => onLinksChanged(() => setVersion((v) => v + 1)),
    [],
  );

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/links/search?${new URLSearchParams({ q: query })}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = (await res.json()) as {
          links: Parameters<typeof parseJsonLinks>[0];
        };
        setLinks(parseJsonLinks(data.links));
      } catch {
        if (controller.signal.aborted) return;
        setLinks([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, version]);

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
        className="dialog-top top-24! h-auto! w-[90vw]!"
        title="Search links"
        description="Filter your saved links by title, URL, or domain"
      >
        <Command className="gap-0 p-0" shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search links..."
            wrapperClassName="p-0 border-b"
            inputGroupClassName="h-10! px-3.5 rounded-t-xl rounded-b-none border-none bg-transparent shadow-none focus-within:border-none focus-within:ring-0 dark:bg-transparent *:data-[slot=input-group-addon]:p-0!"
            className="h-full border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          <CommandList className="max-h-96">
            {!loading && <CommandEmpty>No results found.</CommandEmpty>}
            <CommandGroup className="p-1.5">
              {links.map((link) => (
                <CommandItem
                  key={link.id}
                  value={link.id}
                  className="mb-0.5 cursor-pointer p-0 [&>svg]:hidden"
                >
                  <LinkItem
                    link={link}
                    mode="search"
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
