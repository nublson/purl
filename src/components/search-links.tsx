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
import { useLinksSyncState } from "@/hooks/use-links-sync";
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
  const [failed, setFailed] = React.useState(false);
  const [selected, setSelected] = React.useState("");
  // Query the visible results belong to. Until the debounced search for the
  // current query returns, old results stay on screen but are disabled so
  // Enter can't open a stale match.
  const [resultsFor, setResultsFor] = React.useState<string | null>(null);
  const stale = resultsFor !== query;
  // Re-run the current search when links change (e.g. deleted from results).
  const { version } = useLinksSyncState();

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
        const nextLinks = parseJsonLinks(data.links);
        setLinks(nextLinks);
        // Results arrive async, so cmdk doesn't highlight one itself;
        // start on the first so Enter opens it.
        setSelected(nextLinks[0]?.id ?? "");
        setResultsFor(query);
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setLinks([]);
        setFailed(true);
        setResultsFor(query);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, version]);

  // cmdk 1.1.1 never sets `aria-activedescendant` on its input, so screen
  // readers don't hear which result is highlighted. Mirror the selected
  // option onto the input whenever cmdk changes `aria-selected`.
  const syncActiveDescendant = React.useCallback(
    (input: HTMLInputElement | null) => {
      const root = input?.closest("[cmdk-root]");
      if (!input || !root) return;
      const sync = () => {
        const option = root.querySelector<HTMLElement>(
          '[cmdk-item][aria-selected="true"]',
        );
        if (option?.id) input.setAttribute("aria-activedescendant", option.id);
        else input.removeAttribute("aria-activedescendant");
      };
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributeFilter: ["aria-selected"],
      });
      return () => observer.disconnect();
    },
    [],
  );

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
        description="Filter your saved links by title, URL, or domain. Press Enter to open the highlighted link in a new tab."
      >
        <Command
          className="gap-0 p-0"
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
        >
          <CommandInput
            ref={syncActiveDescendant}
            value={query}
            onValueChange={setQuery}
            placeholder="Search links…"
            wrapperClassName="p-0 border-b"
            inputGroupClassName="h-10! px-3.5 rounded-t-xl rounded-b-none border-none bg-transparent shadow-none focus-within:border-none focus-within:ring-0 dark:bg-transparent *:data-[slot=input-group-addon]:p-0!"
            className="h-full border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          <CommandList className="max-h-96">
            {!loading && (
              <CommandEmpty>
                {failed
                  ? "Unable to search right now. Try again."
                  : query.trim()
                    ? `No links match “${query.trim()}”.`
                    : "No links yet."}
              </CommandEmpty>
            )}
            <CommandGroup className="p-1.5">
              {links.map((link) => (
                <CommandItem
                  key={link.id}
                  value={link.id}
                  disabled={stale}
                  onSelect={() => {
                    window.open(link.url, "_blank", "noopener,noreferrer");
                  }}
                  // Keep stale results at full opacity so typing doesn't flicker.
                  className="mb-0.5 cursor-pointer p-0 data-[disabled=true]:opacity-100 [&>svg]:hidden"
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
