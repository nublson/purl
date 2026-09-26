"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { requestSaveUrl, saveLink } from "@/lib/save-link";
import { Chromium, ClipboardPaste, ExternalLink, Plus } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

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

function isApplePlatform() {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad/i.test(platform);
}

/**
 * Save menu for pointer devices, where the inline field is hidden. Teaches
 * paste-anywhere and offers "Paste link" for people who can't easily press
 * the shortcut (voice control, switch access, trackpad-only). Touch devices
 * keep the inline field on /home.
 */
export function HeaderSaveLink() {
  const { notifyLinksChanged } = useLinksSyncActions();
  const hintId = useId();

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

    // Prefer the page's paste flow (optimistic row, list refresh).
    if (requestSaveUrl(text)) return;

    const result = await saveLink(text);
    if (result && "id" in result) {
      toast.success("Link saved");
      notifyLinksChanged();
    }
  }

  return (
    <DropdownWrapper
      align="end"
      className="w-64"
      trigger={
        <Button
          aria-label="Save link"
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
          Press{" "}
          <kbd className="rounded border px-1 font-sans text-[11px]">
            {isApplePlatform() ? "⌘V" : "Ctrl+V"}
          </kbd>{" "}
          anywhere on this page to save a link.
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
}
