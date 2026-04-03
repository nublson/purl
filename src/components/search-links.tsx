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
  const [query, setQuery] = React.useState("");
  const [semanticLinkIds, setSemanticLinkIds] = React.useState<string[] | null>(
    null,
  );
  const [isSearching, setIsSearching] = React.useState(false);
  const links = React.useMemo(() => normalizeLinks(linksProp), [linksProp]);
  const linksById = React.useMemo(
    () => new Map(links.map((link) => [link.id, link])),
    [links],
  );
  const normalizedQuery = query.trim();
  const useSemanticMode = normalizedQuery.length >= 3;

  React.useEffect(() => {
    if (!useSemanticMode) {
      setSemanticLinkIds(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: normalizedQuery });
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setSemanticLinkIds([]);
          return;
        }
        const data = (await response.json()) as {
          results?: Array<{ linkId: string }>;
        };
        setSemanticLinkIds(data.results?.map((result) => result.linkId) ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setSemanticLinkIds([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery, useSemanticMode]);

  const visibleLinks = React.useMemo(() => {
    if (!useSemanticMode) return links;
    if (!semanticLinkIds) return [];
    return semanticLinkIds
      .map((linkId) => linksById.get(linkId))
      .filter((link): link is Link => Boolean(link));
  }, [links, linksById, semanticLinkIds, useSemanticMode]);

  return (
    <div>
      <Button
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
        <Command
          className="gap-0 p-0"
          shouldFilter={!useSemanticMode}
          filter={(value, search) => {
            if (value.includes(search.toLowerCase())) return 1;
            return 0;
          }}
        >
          <CommandInput
            placeholder="Search links..."
            value={query}
            onValueChange={setQuery}
            wrapperClassName="p-0 border-b"
            inputGroupClassName="h-10! px-3.5 rounded-t-xl rounded-b-none border-none bg-transparent shadow-none focus-within:border-none focus-within:ring-0 dark:bg-transparent *:data-[slot=input-group-addon]:p-0!"
            className="h-full border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          <CommandList className="max-h-96">
            <CommandEmpty>
              {links.length === 0
                ? "No saved links yet."
                : isSearching || (useSemanticMode && semanticLinkIds === null)
                  ? "Searching..."
                  : "No results found."}
            </CommandEmpty>
            <CommandGroup className="p-1.5">
              {visibleLinks.map((link) => (
                <CommandItem
                  key={link.id}
                  value={linkSearchValue(link)}
                  className="mb-0.5 cursor-pointer p-0 [&>svg]:hidden"
                >
                  <LinkItem
                    link={link}
                    key={link.id}
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
