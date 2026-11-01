"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { readerStateMessage } from "@/lib/reader-view";
import type { Link } from "@/utils/links";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Typography } from "./typography";
import { DropdownMenuItem, DropdownMenuLabel } from "./ui/dropdown-menu";

/**
 * The reader view's state at the end of a page pearl's menu, with "Try
 * again" when making it failed. After a retry it reads "Making the reader
 * view…" until the list reload brings the link's new state.
 */
export function ReaderViewMenuState({ link }: { link: Link }) {
  const { notifyLinksChanged } = useLinksSyncActions();
  const [busy, setBusy] = useState(false);
  const [retried, setRetried] = useState(false);
  const busyRef = useRef(false);
  const state = link.readerView;
  // The link prop is the truth again once a reload brings a new state.
  const [seen, setSeen] = useState(state?.status);
  if (seen !== state?.status) {
    setSeen(state?.status);
    setRetried(false);
  }

  async function retry() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/links/${link.id}/reader-view/retry`, {
        method: "POST",
      });
      if (response.ok) {
        setRetried(true);
        notifyLinksChanged();
        return;
      }
      toast.error("Couldn't retry. Try again in a minute.");
    } catch {
      toast.error("Couldn't retry. Try again in a minute.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const failed = state?.status === "FAILED" && !retried;
  return (
    <>
      <DropdownMenuLabel
        data-cy="reader-view-state"
        className="px-2 py-1.5 text-xs font-normal text-muted-foreground"
      >
        <Typography component="span" size="mini">
          {retried
            ? "Making the reader view…"
            : readerStateMessage(state, { short: true })}
        </Typography>
      </DropdownMenuLabel>
      {failed ? (
        <DropdownMenuItem
          data-cy="reader-view-retry"
          aria-busy={busy || undefined}
          disabled={busy}
          onSelect={(event) => {
            event.preventDefault();
            void retry();
          }}
        >
          Try again
        </DropdownMenuItem>
      ) : null}
    </>
  );
}
