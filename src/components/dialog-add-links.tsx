"use client";

import {
  useFolderActions,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { addLinksDialog, useAddLinksDialogOpen } from "@/lib/add-links-dialog";
import { formatFolderLabel, formatLinkCount } from "@/lib/folder-display";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { isApplePlatform } from "@/lib/platform";
import { formatDomain } from "@/utils/formatter";
import { parseJsonLinks, type Link } from "@/utils/links";
import { Search } from "lucide-react";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { FolderEmoji } from "./folder-emoji";
import { LinkIcon } from "./link-icon";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { DialogClose, DialogFooter } from "./ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "./ui/input-group";

/** Opens the dialog from anywhere on a folder page (see `DialogAddLinks`). */
export const ADD_LINKS_SHORTCUT = "A";

/** Results fetched per search. */
const RESULT_LIMIT = 50;
/** Wait after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 200;

type Results =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; links: Link[]; hasMore: boolean };

/**
 * "Add links" on a folder page: search your other saved links (every link
 * not already in this folder; ones in another folder say which) and move
 * the ones you pick into this folder, as one bulk move with one Undo toast.
 * Opened from the header's add menu, the folder's empty state, or `A`.
 */
export function DialogAddLinks({ folder }: { folder: FolderSummary }) {
  const open = useAddLinksDialogOpen();

  // `A` anywhere on the folder page, unless typing or a dialog/menu is open.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== ADD_LINKS_SHORTCUT.toLowerCase()) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      event.preventDefault();
      addLinksDialog.open();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Leaving the folder page closes it (the store outlives the page).
  React.useEffect(() => () => addLinksDialog.close(), []);

  return (
    <DialogWrapper
      title="Add links"
      description={`Pick saved links to move into ${formatFolderLabel(folder)}.`}
      open={open}
      onOpenChange={addLinksDialog.setOpen}
      className="sm:max-w-lg"
      content={
        <AddLinksForm folder={folder} onDone={() => addLinksDialog.close()} />
      }
    />
  );
}

function AddLinksForm({
  folder,
  onDone,
}: {
  folder: FolderSummary;
  onDone: () => void;
}) {
  const { folders } = useFolders();
  const { moveLinks } = useFolderActions();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [results, setResults] = React.useState<Results>({ status: "loading" });
  // Kept across searches, so picks survive a new query.
  const [selected, setSelected] = React.useState<ReadonlyMap<string, Link>>(
    () => new Map(),
  );
  const [pending, setPending] = React.useState(false);
  const listId = React.useId();
  const statusId = React.useId();

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
    setResults({ status: "loading" });
    fetch(`/api/links/search?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          links: Parameters<typeof parseJsonLinks>[0];
          hasMore: boolean;
        };
        setResults({
          status: "ready",
          links: parseJsonLinks(body.links),
          hasMore: body.hasMore,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResults({ status: "error" });
      });
    return () => controller.abort();
  }, [debouncedQuery, folder.id]);

  const toggle = (link: Link) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(link.id)) next.delete(link.id);
      else next.set(link.id, link);
      return next;
    });
  };

  const shown = results.status === "ready" ? results.links : [];
  const allShownSelected =
    shown.length > 0 && shown.every((link) => selected.has(link.id));
  const toggleAllShown = () => {
    setSelected((current) => {
      const next = new Map(current);
      for (const link of shown) {
        if (allShownSelected) next.delete(link.id);
        else next.set(link.id, link);
      }
      return next;
    });
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (selected.size === 0 || pending) return;
    setPending(true);
    const result = await moveLinks(Array.from(selected.keys()), folder.id, {
      target: folder,
    });
    setPending(false);
    if (result.ok) onDone();
  }

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const count = selected.size;

  return (
    <form
      className="flex flex-col gap-3 px-6 pt-1"
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        // ⌘A / Ctrl+A in the list picks every result shown (in the search
        // field it keeps selecting the text).
        const mod = isApplePlatform() ? event.metaKey : event.ctrlKey;
        if (
          mod &&
          event.key.toLowerCase() === "a" &&
          !isTypingTarget(event.target)
        ) {
          event.preventDefault();
          if (!allShownSelected) toggleAllShown();
        }
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          autoFocus
          aria-label="Search your links"
          aria-controls={listId}
          aria-describedby={statusId}
          placeholder="Search by title, site or URL"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>

      <Typography
        component="p"
        size="mini"
        id={statusId}
        role="status"
        className="min-h-4 text-muted-foreground"
      >
        {results.status === "loading"
          ? "Searching…"
          : results.status === "error"
            ? "Unable to load your links. Check your connection and try again."
            : results.links.length === 0
              ? debouncedQuery
                ? `No links match “${debouncedQuery}”.`
                : "Every link you’ve saved is already in this folder."
              : results.hasMore
                ? `Showing the ${RESULT_LIMIT} newest matches. Search to narrow them down.`
                : `${formatLinkCount(results.links.length)}`}
      </Typography>

      <ul
        id={listId}
        aria-label="Your links"
        className="-mx-2 flex max-h-[min(50vh,22rem)] flex-col overflow-y-auto overscroll-y-contain"
      >
        {shown.map((link) => {
          const other = link.folderId ? folderById.get(link.folderId) : null;
          return (
            <Typography component="li" key={link.id} className="contents">
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40 has-data-checked:bg-accent/60">
                <Checkbox
                  checked={selected.has(link.id)}
                  onCheckedChange={() => toggle(link)}
                  aria-label={`Add ${link.title}`}
                />
                {/* The same 20px box the list's rows give the favicon. */}
                <Typography
                  component="span"
                  aria-hidden
                  className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded"
                >
                  <LinkIcon link={link} size="default" />
                </Typography>
                <Typography
                  component="span"
                  className="flex min-w-0 flex-1 items-baseline gap-2"
                >
                  <Typography
                    component="span"
                    size="small"
                    className="min-w-0 truncate font-medium text-foreground"
                  >
                    {link.title}
                  </Typography>
                  <Typography
                    component="span"
                    size="small"
                    className="hidden shrink-0 sm:inline"
                  >
                    {formatDomain(link.domain)}
                  </Typography>
                </Typography>
                {other ? (
                  // It's in another folder: adding it here moves it.
                  <Typography
                    component="span"
                    size="mini"
                    className="flex max-w-32 shrink-0 items-center gap-1"
                  >
                    <FolderEmoji emoji={other.emoji} />
                    <Typography component="span" size="mini" className="truncate">
                      {other.name}
                    </Typography>
                  </Typography>
                ) : null}
              </label>
            </Typography>
          );
        })}
      </ul>

      <DialogFooter className="items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={shown.length === 0}
          className="text-muted-foreground hover:text-foreground"
          onClick={toggleAllShown}
        >
          {allShownSelected ? "Deselect all" : "Select all"}
        </Button>
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={count === 0 || pending}>
            {pending
              ? "Adding…"
              : count === 0
                ? "Add links"
                : `Add ${formatLinkCount(count)}`}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
