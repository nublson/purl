"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useCurrentFolder } from "@/hooks/use-folders";
import { addLinksPopover, ADD_LINKS_SHORTCUT } from "@/lib/add-links-popover";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { isApplePlatform } from "@/lib/platform";
import { Chrome, Export5, Plus } from "reicon-react";
import { useEffect } from "react";
import { AddLinksPopover } from "./add-links-popover";
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
 * The header's + menu, for pointers that hover (desktop): teaches
 * paste-anywhere and links the apps and extensions. Nothing else: saving,
 * uploading and adding links have their own ways in (paste, drop, `U`, the
 * search field, `A`). On a folder page `A` opens `AddLinksPopover` under
 * the + button.
 */
export function HeaderAddMenu() {
  const currentFolder = useCurrentFolder();
  const isDemo = useIsDemo();

  // `A` on a folder page opens "Add links" (not while typing, or with a
  // dialog or menu open).
  useEffect(() => {
    if (!currentFolder || isDemo) return;
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
  }, [currentFolder, isDemo]);

  const menu = (
    <DropdownWrapper
      align="end"
      className="w-64"
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
        <span className="text-xs font-normal text-muted-foreground">
          Press <Kbd>{isApplePlatform() ? "⌘V" : "Ctrl+V"}</Kbd> anywhere on
          this page to save a link.
        </span>
      </DropdownMenuLabel>
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
                <Chrome />
                Chrome Extension
                <span className="sr-only">(opens in new tab)</span>
                <Export5 className="ml-auto text-muted-foreground" />
              </a>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      ) : null}
    </DropdownWrapper>
  );

  // On a folder page, "Add links" opens under the + button.
  return currentFolder && !isDemo ? (
    <AddLinksPopover folder={currentFolder} placement="header" align="end">
      <div className="inline-flex">{menu}</div>
    </AddLinksPopover>
  ) : (
    menu
  );
}
