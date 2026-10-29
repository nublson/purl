"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { haptic } from "@/lib/haptics";
import type { Link } from "@/utils/links";
import { useState } from "react";
import { Globe } from "reicon-react";
import { toast } from "sonner";
import { HapticTarget } from "./haptic-target";
import { SwitchIndicator } from "./layout-menu-items";
import { DropdownMenuCheckboxItem } from "./ui/dropdown-menu";

const FALLBACK_ERROR = "Couldn't change Show live. Try again.";

/**
 * "Show live" in a page pearl's menu: whether the pearl shows the page
 * itself in a frame. A checkbox item drawn with a switch (like Folder
 * tags); the switch moves at once and goes back, with the server's reason
 * in a toast, when the site can't be shown live.
 */
export function ShowLiveMenuItem({ link }: { link: Link }) {
  const { notifyLinksChanged } = useLinksSyncActions();
  const [checked, setChecked] = useState(link.embed);
  // The link prop is the truth again once a reload brings a new value.
  const [seen, setSeen] = useState(link.embed);
  if (seen !== link.embed) {
    setSeen(link.embed);
    setChecked(link.embed);
  }

  async function change(next: boolean) {
    haptic("selection");
    setChecked(next);
    try {
      const response = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embed: next }),
      });
      if (response.ok) {
        notifyLinksChanged();
        return;
      }
      setChecked(!next);
      let message = FALLBACK_ERROR;
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (body?.error) message = body.error;
      }
      toast.error(message);
    } catch {
      setChecked(!next);
      toast.error(FALLBACK_ERROR);
    }
  }

  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      data-cy="show-live-toggle"
      className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(value) => {
        void change(value === true);
      }}
    >
      <Globe />
      Show live
      <SwitchIndicator on={checked} />
      <HapticTarget />
    </DropdownMenuCheckboxItem>
  );
}
