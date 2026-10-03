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
    const result = await updateFolder(folder.id, { isPublic: next });
    setSaving(false);
    setOptimistic(null);
    if (!result.ok) toast.error(result.error);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    } catch {
      toast.error("Couldn’t copy the link. Select it and copy it instead.");
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="cursor-pointer">
          {isPublic ? (
            <Globe data-icon="inline-start" />
          ) : (
            <Lock data-icon="inline-start" />
          )}
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 gap-0 p-0">
        <PopoverHeader className="gap-1 p-4 pb-3">
          <PopoverTitle>Visibility</PopoverTitle>
          <PopoverDescription>Make this folder public to everyone.</PopoverDescription>
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
              className="relative cursor-pointer text-muted-foreground"
            >
              {/* Cross-fade (better-ui icon recipe): both icons stay mounted. */}
              <Copy
                aria-hidden
                className={cn(
                  "transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                  copied ? "scale-25 opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
                )}
              />
              <Check
                aria-hidden
                className={cn(
                  "absolute transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                  copied ? "scale-100 opacity-100 blur-0" : "scale-25 opacity-0 blur-[4px]",
                )}
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
