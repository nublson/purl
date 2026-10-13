"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useCurrentFolder, useFolderActions } from "@/hooks/use-folders";
import { haptic } from "@/lib/haptics";
import { publicFolderFeedPath, publicFolderPath } from "@/lib/public-folder-path";
import { cn } from "@/lib/utils";
import { Check, Copy3, Feed, Globe, Lock } from "reicon-react";
import * as React from "react";
import { toast } from "sonner";
import { HapticTarget } from "./haptic-target";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/popover";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";

/** How long the copy button shows its check. */
const COPIED_MS = 1500;

/** Icon cross-fade (scale 0.25→1, opacity 0→1, blur 4px→0). */
const ICON_SWAP =
  "transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]";
const ICON_IN = "scale-100 opacity-100 blur-0";
const ICON_OUT = "scale-25 opacity-0 blur-[4px]";

/**
 * The header's Share button on a folder page (lock when private, globe when
 * public) and its popover: a Public switch and the folder's public link
 * (`/@username/slug`) with a copy button. While the folder is public, a
 * "Copy feed link" button below it copies its Atom feed
 * (`/@username/slug/feed.xml`); it opens with Public, since there's no feed
 * to copy before then. Copying waits until sharing is saved.
 */
export function FolderSharePopover() {
  const folder = useCurrentFolder();
  const { user } = useCurrentUser();
  const { updateFolder } = useFolderActions();
  // The demo's folder is shown as shared and can't be changed.
  const isDemo = useIsDemo();
  const [saving, setSaving] = React.useState(false);
  // Shown right away; the server's answer (or a failure) settles it.
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
  // Which copy button shows its check (one at a time, one shared timer).
  const [copied, setCopied] = React.useState<CopyKind | null>(null);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchId = React.useId();

  React.useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  if (!folder || !user) return null;
  const isPublic = isDemo || (optimistic ?? folder.isPublic);
  const path = publicFolderPath(user.username, folder.slug);
  const feedPath = publicFolderFeedPath(user.username, folder.slug);
  // Only once sharing is saved: the switch moves right away, but the links
  // work only after the server confirms.
  const canCopy = (isDemo || folder.isPublic) && !saving;

  async function setPublic(next: boolean) {
    if (!folder) return;
    setOptimistic(next);
    setSaving(true);
    const result = await updateFolder(
      folder.id,
      { isPublic: next },
      { quiet: true },
    );
    setSaving(false);
    setOptimistic(null);
    if (!result.ok) toast.error(result.error);
  }

  async function copy(kind: CopyKind, targetPath: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${targetPath}`,
      );
    } catch {
      toast.error(
        kind === "link"
          ? "Unable to copy the link. Select it and copy it instead."
          : "Unable to copy the feed link. Try again.",
      );
      return;
    }
    // Android: a success only once it's copied (iOS ticks on the tap).
    haptic("success");
    setCopied(kind);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          // Private: the action ("Share", ghost). Public: the state, in the
          // switch's word ("Public", filled), so a shared folder reads as
          // shared at a glance. The name keeps the visible word first.
          // The word shows from lg; below, the lock/globe alone in a 32px
          // square (like the header's Add button), with the same name.
          variant={isPublic ? "secondary" : "ghost"}
          size="sm"
          aria-label={isPublic ? "Public, sharing settings" : "Share"}
          aria-haspopup="dialog"
          className="cursor-pointer max-lg:size-8 max-lg:px-0 max-lg:has-data-[icon=inline-start]:pl-0"
        >
          {/* Lock and globe cross-fade (same recipe as the copy button);
              the label swaps instantly. */}
          <span data-icon="inline-start" className="relative flex size-4">
            <Lock
              aria-hidden
              className={cn(ICON_SWAP, isPublic ? ICON_OUT : ICON_IN)}
            />
            <Globe
              aria-hidden
              className={cn(
                "absolute inset-0",
                ICON_SWAP,
                isPublic ? ICON_IN : ICON_OUT,
              )}
            />
          </span>
          <span className="max-lg:hidden">{isPublic ? "Public" : "Share"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 gap-0 p-0">
        <PopoverHeader className="gap-1 p-4 pb-3">
          <PopoverTitle>Visibility</PopoverTitle>
          <PopoverDescription>
            Anyone with the link can see this folder and its links.
          </PopoverDescription>
        </PopoverHeader>
        <div className="px-4">
          <Separator />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <Typography
              component="span"
              size="small"
              className="text-foreground"
            >
              <label htmlFor={switchId}>Public</label>
            </Typography>
            <Switch
              id={switchId}
              checked={isPublic}
              disabled={saving || isDemo}
              onCheckedChange={(next) => void setPublic(next)}
            />
          </div>
          <div>
            <div className="flex h-10 items-center gap-2 rounded-md border bg-input/30 ps-3 pe-1">
              <Typography
                component="span"
                size="small"
                className={cn(
                  "min-w-0 flex-1 truncate select-all transition-colors duration-150",
                  isPublic && "text-foreground",
                )}
              >
                {/* Origin without the scheme, like the design: purl.live/@you/folder */}
                <HostPrefix />
                {path}
              </Typography>
              <CopyButton
                copied={copied === "link"}
                disabled={!canCopy}
                onCopy={() => void copy("link", path)}
              />
            </div>
            {/* Opens with Public (height and opacity; none under reduced
                motion). `invisible` while private keeps it out of the tab
                order and the accessibility tree, and, as a discrete
                property, flips only once the close has finished. The inner
                box's 4px padding and matching negative margin leave room for
                the focus ring inside the clip. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-none",
                isPublic
                  ? "grid-rows-[1fr] opacity-100"
                  : "invisible grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="-m-1 min-h-0 overflow-hidden p-1">
                <div className="pt-3">
                  <CopyFeedButton
                    copied={copied === "feed"}
                    disabled={!canCopy}
                    onCopy={() => void copy("feed", feedPath)}
                  />
                </div>
              </div>
            </div>
          </div>
          <span aria-live="polite" className="sr-only">
            {copied === "link"
              ? "Link copied"
              : copied === "feed"
                ? "Feed link copied"
                : ""}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type CopyKind = "link" | "feed";

/** The link field's icon button; it cross-fades to a check once it has copied. */
function CopyButton({
  copied,
  disabled,
  onCopy,
}: {
  copied: boolean;
  disabled: boolean;
  onCopy: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label={copied ? "Link copied" : "Copy link"}
      onClick={onCopy}
      // Concentric with the field: its radius minus the 4px inset.
      className="relative cursor-pointer rounded-[calc(var(--radius-md)-4px)] text-muted-foreground"
    >
      {/* Cross-fade: both icons stay mounted. */}
      <Copy3 aria-hidden className={cn(ICON_SWAP, copied ? ICON_OUT : ICON_IN)} />
      <Check
        aria-hidden
        className={cn("absolute", ICON_SWAP, copied ? ICON_IN : ICON_OUT)}
      />
      <HapticTarget />
    </Button>
  );
}

/**
 * The feed's button: its own words, so it needs no label row. The feed icon
 * cross-fades to a check once it has copied; the words swap instantly.
 */
function CopyFeedButton({
  copied,
  disabled,
  onCopy,
}: {
  copied: boolean;
  disabled: boolean;
  onCopy: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onCopy}
      className="relative cursor-pointer text-muted-foreground hover:text-foreground"
    >
      <span data-icon="inline-start" className="relative flex size-4">
        <Feed aria-hidden className={cn(ICON_SWAP, copied ? ICON_OUT : ICON_IN)} />
        <Check
          aria-hidden
          className={cn(
            "absolute inset-0",
            ICON_SWAP,
            copied ? ICON_IN : ICON_OUT,
          )}
        />
      </span>
      {copied ? "Feed link copied" : "Copy feed link"}
      <HapticTarget />
    </Button>
  );
}

/** The page's host (e.g. `purl.live`), read after mount. */
function HostPrefix() {
  const host = React.useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => "",
  );
  return <>{host}</>;
}
