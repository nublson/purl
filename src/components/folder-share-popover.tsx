"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { useCurrentFolder, useFolderActions } from "@/hooks/use-folders";
import { publicFolderPath } from "@/lib/public-folder-path";
import { cn } from "@/lib/utils";
import { Check, Copy, Globe, Lock } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
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
 * (`/@username/slug`) with a copy button. The link only works while the
 * folder is public, so copying is off until then.
 */
export function FolderSharePopover() {
  const folder = useCurrentFolder();
  const { user } = useCurrentUser();
  const { updateFolder } = useFolderActions();
  const [saving, setSaving] = React.useState(false);
  // Shown right away; the server's answer (or a failure) settles it.
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchId = React.useId();

  React.useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  if (!folder || !user) return null;
  const isPublic = optimistic ?? folder.isPublic;
  const path = publicFolderPath(user.username, folder.slug);

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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    } catch {
      toast.error("Unable to copy the link. Select it and copy it instead.");
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          // Private: the action ("Share", ghost). Public: the state, in the
          // switch's word ("Public", filled), so a shared folder reads as
          // shared at a glance. The name keeps the visible word first.
          variant={isPublic ? "secondary" : "ghost"}
          size="sm"
          aria-label={isPublic ? "Public, sharing settings" : undefined}
          aria-haspopup="dialog"
          className="cursor-pointer"
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
          {isPublic ? "Public" : "Share"}
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
              disabled={saving}
              onCheckedChange={(next) => void setPublic(next)}
            />
          </div>
          <div
            className="flex h-10 items-center gap-2 rounded-md border bg-input/30 ps-3 pe-1"
          >
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
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!isPublic}
              aria-label={copied ? "Link copied" : "Copy link"}
              onClick={() => void copyLink()}
              // Concentric with the field: its radius minus the 4px inset.
              className="relative cursor-pointer rounded-[calc(var(--radius-md)-4px)] text-muted-foreground"
            >
              {/* Cross-fade: both icons stay mounted. */}
              <Copy
                aria-hidden
                className={cn(ICON_SWAP, copied ? ICON_OUT : ICON_IN)}
              />
              <Check
                aria-hidden
                className={cn("absolute", ICON_SWAP, copied ? ICON_IN : ICON_OUT)}
              />
            </Button>
          </div>
          <span aria-live="polite" className="sr-only">
            {copied ? "Link copied" : ""}
          </span>
        </div>
      </PopoverContent>
    </Popover>
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
