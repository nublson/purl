"use client";

import { useCurrentFolder } from "@/hooks/use-folders";
import { addLinksPopover, ADD_LINKS_SHORTCUT } from "@/lib/add-links-popover";
import { ListPlus, PackageOpen, SearchX } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AddLinksPopover } from "./add-links-popover";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

/**
 * Empty list. On a folder page (`inFolder`) it also offers "Add links" to
 * pull in links you've already saved. With a search (`query`) it says
 * nothing matched instead.
 */
export function LinkGroupEmpty({
  inFolder = false,
  query,
}: {
  inFolder?: boolean;
  query?: string;
}) {
  const folder = useCurrentFolder();
  if (query) {
    return (
      <Empty data-cy="link-group-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>No links match “{query}”</EmptyTitle>
          <EmptyDescription>
            Try another word, or paste a link to save it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Empty data-cy="link-group-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
        </EmptyMedia>
        <EmptyTitle>{inFolder ? "No links in this folder yet" : "No links yet"}</EmptyTitle>
        <EmptyDescription>
          {inFolder
            ? "Paste a link to save it here, or add links you’ve already saved."
            : "Paste a link anywhere on this page to save it."}
        </EmptyDescription>
      </EmptyHeader>
      {inFolder && folder ? (
        <EmptyContent>
          <AddLinksPopover folder={folder} placement="empty">
            <Button
              variant="outline"
              size="sm"
              aria-haspopup="dialog"
              aria-keyshortcuts={ADD_LINKS_SHORTCUT}
              onClick={() => addLinksPopover.open("empty")}
            >
              <ListPlus data-icon="inline-start" />
              Add links
              <Kbd aria-hidden="true">{ADD_LINKS_SHORTCUT}</Kbd>
            </Button>
          </AddLinksPopover>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
