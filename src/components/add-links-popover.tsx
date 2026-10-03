"use client";

import {
  useFolderActions,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import {
  addLinksPopover,
  useAddLinksPopoverAnchor,
  type AddLinksAnchor,
} from "@/lib/add-links-popover";
import { formatFolderLabel, formatLinkCount } from "@/lib/folder-display";
import { isApplePlatform } from "@/lib/platform";
import { formatDomain } from "@/utils/formatter";
import { parseJsonLinks, type Link } from "@/utils/links";
import * as React from "react";
import { FolderEmoji } from "./folder-emoji";
import { LinkIcon } from "./link-icon";
import { Typography } from "./typography";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

/** Links shown at a time: the 10 most recent by default, or 10 matches. */
const RESULT_LIMIT = 10;
/** Wait after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 200;

type Results =
  | { status: "loading"; links: Link[] }
  | { status: "error"; links: Link[] }
  | { status: "ready"; links: Link[] };

/**
 * "Add links" on a folder page: a popover attached to `children` (its
 * anchor) with a search field and your 10 most recent links that aren't in
 * this folder (searching shows 10 matches). Click (or Enter) checks links,
 * and checks survive a new search; "Add N links" (or ⌘/Ctrl+Enter) moves
 * them all in as one move with one Undo toast, and the list refills.
 * Opens when `addLinksPopover.open(placement)` is called.
 */
export function AddLinksPopover({
  folder,
  placement,
  align = "center",
  children,
}: {
  folder: FolderSummary;
  placement: AddLinksAnchor;
  align?: "start" | "center" | "end";
  children: React.ReactElement;
}) {
  const open = useAddLinksPopoverAnchor() === placement;
  const anchorRef = React.useRef<HTMLDivElement>(null);

  // Its anchor going away closes it (the store outlives the page), but only
  // if it's open on that anchor: the empty state disappearing must not close
  // the header's picker. Adding the first links from the empty state removes
  // it, so that picker closes too: the job is done.
  React.useEffect(
    () => () => {
      if (addLinksPopover.current() === placement) addLinksPopover.close();
    },
    [placement],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) addLinksPopover.close();
      }}
    >
      <PopoverAnchor asChild ref={anchorRef}>
        {children}
      </PopoverAnchor>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-80 gap-0 p-0"
        aria-label={`Add links to ${formatFolderLabel(folder)}`}
        // It's anchored, not triggered: hand focus back to the anchor.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const anchor = anchorRef.current;
          const target = anchor?.matches("button, a")
            ? anchor
            : anchor?.querySelector<HTMLElement>("button, a");
          target?.focus();
        }}
      >
        <AddLinksPicker folder={folder} />
      </PopoverContent>
    </Popover>
  );
}

function AddLinksPicker({ folder }: { folder: FolderSummary }) {
  const { folders } = useFolders();
  const { moveLinks } = useFolderActions();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [results, setResults] = React.useState<Results>({
    status: "loading",
    links: [],
  });
  // Bumped after an add, to refill the list.
  const [refreshToken, setRefreshToken] = React.useState(0);
  // Checked links, kept across searches.
  const [checked, setChecked] = React.useState<ReadonlyMap<string, Link>>(
    () => new Map(),
  );
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: debouncedQuery,
      notInFolderId: folder.id,
      limit: String(RESULT_LIMIT),
    });
    // Keep showing the current links while the next ones load.
    setResults((current) => ({ status: "loading", links: current.links }));
    fetch(`/api/links/search?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          links: Parameters<typeof parseJsonLinks>[0];
        };
        setResults({ status: "ready", links: parseJsonLinks(body.links) });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults((current) => ({ status: "error", links: current.links }));
        }
      });
    return () => controller.abort();
  }, [debouncedQuery, folder.id, refreshToken]);

  const toggle = (link: Link) => {
    setChecked((current) => {
      const next = new Map(current);
      if (next.has(link.id)) next.delete(link.id);
      else next.set(link.id, link);
      return next;
    });
  };

  async function addChecked() {
    if (checked.size === 0 || adding) return;
    const ids = Array.from(checked.keys());
    setAdding(true);
    const result = await moveLinks(ids, folder.id, { target: folder });
    setAdding(false);
    if (!result.ok) return;
    setChecked(new Map());
    // Gone from this list right away; the refetch brings the next ones in.
    setResults((current) => ({
      ...current,
      links: current.links.filter((l) => !ids.includes(l.id)),
    }));
    setRefreshToken((t) => t + 1);
  }

  const [apple, setApple] = React.useState(false);
  React.useEffect(() => setApple(isApplePlatform()), []);

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const searching = debouncedQuery.trim().length > 0;

  return (
    <Command
      shouldFilter={false}
      loop
      className="rounded-md!"
      onKeyDown={(event) => {
        // ⌘/Ctrl+Enter adds; plain Enter checks the highlighted link.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void addChecked();
        }
      }}
    >
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Search your links"
        aria-label="Search your links"
      />
      <CommandList>
        <CommandEmpty>
          <Typography component="span" size="small">
            {results.status === "loading"
              ? "Searching…"
              : results.status === "error"
                ? "Unable to load your links. Try again."
                : searching
                  ? `No links match “${debouncedQuery.trim()}”.`
                  : "Every link you’ve saved is already here."}
          </Typography>
        </CommandEmpty>
        {results.links.length > 0 ? (
          <CommandGroup heading={searching ? "Results" : "Recently saved"}>
            {results.links.map((link) => {
              const other = link.folderId
                ? folderById.get(link.folderId)
                : undefined;
              return (
                <CommandItem
                  key={link.id}
                  value={link.id}
                  data-checked={checked.has(link.id)}
                  disabled={adding}
                  onSelect={() => toggle(link)}
                  className="gap-2.5"
                >
                  <Typography
                    component="span"
                    aria-hidden
                    className="relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm"
                  >
                    <LinkIcon link={link} size="mini" />
                  </Typography>
                  <Typography
                    component="span"
                    size="small"
                    className="min-w-0 flex-1 truncate text-foreground"
                  >
                    {link.title}
                    <Typography component="span" size="small" className="ms-2">
                      {formatDomain(link.domain)}
                    </Typography>
                  </Typography>
                  {checked.has(link.id) ? (
                    <Typography component="span" className="sr-only">
                      Checked
                    </Typography>
                  ) : null}
                  {other ? (
                    // In another folder: adding moves it out of there.
                    <Typography
                      component="span"
                      title={other.name}
                      className="flex shrink-0 items-center"
                    >
                      <FolderEmoji emoji={other.emoji} />
                      <Typography component="span" className="sr-only">
                        {`In ${other.name}`}
                      </Typography>
                    </Typography>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
      </CommandList>
      {checked.size > 0 ? (
        <>
          <CommandSeparator className="mx-0 my-1" />
          <div className="flex items-center justify-between gap-2 p-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={adding}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setChecked(new Map())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              disabled={adding}
              aria-keyshortcuts={apple ? "Meta+Enter" : "Control+Enter"}
              onClick={() => void addChecked()}
            >
              {adding ? "Adding…" : `Add ${formatLinkCount(checked.size)}`}
              <Kbd aria-hidden="true" className="bg-primary-foreground/15 text-primary-foreground">
                {apple ? "⌘↵" : "Ctrl+↵"}
              </Kbd>
            </Button>
          </div>
        </>
      ) : null}
    </Command>
  );
}
