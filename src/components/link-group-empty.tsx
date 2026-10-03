"use client";

import { addLinksDialog } from "@/lib/add-links-dialog";
import { ListPlus, PackageOpen } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ADD_LINKS_SHORTCUT } from "./dialog-add-links";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

/**
 * Empty list. On a folder page (`inFolder`) it also offers "Add links" to
 * pull in links you've already saved.
 */
export function LinkGroupEmpty({ inFolder = false }: { inFolder?: boolean }) {
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
      {inFolder ? (
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            aria-keyshortcuts={ADD_LINKS_SHORTCUT}
            onClick={() => addLinksDialog.open()}
          >
            <ListPlus data-icon="inline-start" />
            Add links
            <Kbd aria-hidden="true">{ADD_LINKS_SHORTCUT}</Kbd>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
