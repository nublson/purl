"use client";

import { useCurrentFolder } from "@/hooks/use-folders";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { addLinksPopover, ADD_LINKS_SHORTCUT } from "@/lib/add-links-popover";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { isApplePlatform } from "@/lib/platform";
import { requestSaveUrl, saveLink } from "@/lib/save-link";
import { Chromium, ClipboardPaste, ExternalLink, ListPlus, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { AddLinksPopover } from "./add-links-popover";
import { toast } from "sonner";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Kbd } from "./ui/kbd";

// Chrome Web Store listing for the extension; the section is hidden until set.
const CHROME_EXTENSION_URL = safeHttpsUrl(
  process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL,
);

function safeHttpsUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The header's + menu (pointer devices): teaches paste-anywhere and offers
 * "Paste link" for people who can't easily press the shortcut (voice
 * control, switch access, trackpad-only). On a folder page it also offers
 * "Add links" (also `A`), which opens `AddLinksPopover` under the + button.
 */
export function HeaderAddMenu() {
  const { notifyLinksChanged } = useLinksSyncActions();
  const currentFolder = useCurrentFolder();
  const pathname = usePathname();
  const hintId = useId();
  // Set by "Add links": the popover opens once the menu has closed and
  // handed focus back to the + button, so it returns focus there.
  const pendingAddLinks = useRef(false);

  // `A` on a folder page opens "Add links" (not while typing, or with a
  // dialog or menu open).
  useEffect(() => {
    if (!currentFolder) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== ADD_LINKS_SHORTCUT.toLowerCase()) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      event.preventDefault();
      addLinksPopover.open("header");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [currentFolder]);

  async function handlePasteLink() {
    let text: string;
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      toast.error(
        "Unable to read your clipboard. Allow clipboard access, or paste anywhere on the page.",
      );
      return;
    }
    if (!text) {
      toast.error("Your clipboard is empty. Copy a link, then try again.");
      return;
    }

    // Prefer the page's paste flow (optimistic row, list refresh). On a
    // folder page this files into the page's own folder (by id): the page's
    // PasteHandler sits inside its CurrentFolderProvider, this header doesn't.
    if (requestSaveUrl(text)) return;

    // Fallback (no page handler mounted yet, e.g. the folder page is still
    // streaming): `currentFolder` here comes from the URL slug. On a folder
    // route where that lookup misses, don't silently save unfiled.
    if (!currentFolder && pathname?.startsWith("/folders/")) {
      toast.error("Unable to save to this folder yet. Try again in a moment.");
      return;
    }

    const result = await saveLink(
      text,
      currentFolder
        ? {
            folder: {
              id: currentFolder.id,
              name: currentFolder.name,
              emoji: currentFolder.emoji,
            },
          }
        : undefined,
    );
    if (result && "id" in result) {
      // saveLink already toasts "Saved to {name}"/"Moved to {name}" when a
      // folder is passed; avoid a second "Link saved" toast on top of it.
      if (!currentFolder) toast.success("Link saved");
      notifyLinksChanged();
    }
  }

  const menu = (
    <DropdownWrapper
      align="end"
      className="w-64"
      onCloseAutoFocus={(event) => {
        if (!pendingAddLinks.current) return;
        pendingAddLinks.current = false;
        event.preventDefault();
        addLinksPopover.open("header");
      }}
      trigger={
        <Button
          aria-label="Add"
          variant="ghost"
          size="icon-sm"
          className="hidden cursor-pointer text-muted-foreground [@media(hover:hover)]:inline-flex"
        >
          <Plus />
        </Button>
      }
    >
      <DropdownMenuLabel className="flex flex-col gap-1 px-2 py-1.5">
        <span className="text-sm font-medium text-foreground">
          Paste to save
        </span>
        <span id={hintId} className="text-xs font-normal text-muted-foreground">
          Press <Kbd>{isApplePlatform() ? "⌘V" : "Ctrl+V"}</Kbd> anywhere on
          this page to save a link.
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          aria-describedby={hintId}
          onSelect={() => {
            void handlePasteLink();
          }}
        >
          <ClipboardPaste />
          Paste link
        </DropdownMenuItem>
        {/* Folder pages only: pick links you've already saved. */}
        {currentFolder ? (
          <DropdownMenuItem
            aria-keyshortcuts={ADD_LINKS_SHORTCUT}
            onSelect={() => {
              pendingAddLinks.current = true;
            }}
          >
            <ListPlus />
            Add links
            <Kbd aria-hidden="true" className="ms-auto">
              {ADD_LINKS_SHORTCUT}
            </Kbd>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      {CHROME_EXTENSION_URL ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Apps & Extensions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Chromium />
                Chrome
                <span className="sr-only">(opens in new tab)</span>
                <ExternalLink className="ml-auto text-muted-foreground" />
              </a>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      ) : null}
    </DropdownWrapper>
  );

  // On a folder page, "Add links" opens under the + button.
  return currentFolder ? (
    <AddLinksPopover folder={currentFolder} placement="header" align="end">
      <div className="inline-flex">{menu}</div>
    </AddLinksPopover>
  ) : (
    menu
  );
}
