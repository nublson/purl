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
import { formatFolderLabel } from "@/lib/folder-display";
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
} from "./ui/command";
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
 * this folder (searching shows 10 matches). Picking one moves it into the
 * folder (Undo in the toast) and the list refills, so you can keep adding.
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

  // Leaving the page closes it (the store outlives the page).
  React.useEffect(() => () => addLinksPopover.close(), []);

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
  const [adding, setAdding] = React.useState<ReadonlySet<string>>(new Set());

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

  async function add(link: Link) {
    if (adding.has(link.id)) return;
    setAdding((current) => new Set(current).add(link.id));
    const result = await moveLinks([link.id], folder.id, { target: folder });
    setAdding((current) => {
      const next = new Set(current);
      next.delete(link.id);
      return next;
    });
    if (!result.ok) return;
    // Gone from this list right away; the refetch brings the next one in.
    setResults((current) => ({
      ...current,
      links: current.links.filter((l) => l.id !== link.id),
    }));
    setRefreshToken((t) => t + 1);
  }

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const searching = debouncedQuery.trim().length > 0;

  return (
    <Command shouldFilter={false} loop className="rounded-md!">
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
                  disabled={adding.has(link.id)}
                  onSelect={() => void add(link)}
                  // The trailing check slot isn't used here.
                  className="gap-2.5 *:last:hidden"
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
    </Command>
  );
}
