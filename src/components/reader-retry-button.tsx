"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";

/**
 * "Try again" for a failed reader view on the read page. A retry clears the
 * failed row, so the refreshed page reads "Purl is making the reader view".
 */
export function ReaderRetryButton({ linkId }: { linkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function retry() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/links/${linkId}/reader-view/retry`, {
        method: "POST",
      });
      if (response.ok) {
        router.refresh();
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

  return (
    <Button
      variant="outline"
      size="sm"
      data-cy="reader-page-retry"
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => void retry()}
      className="mt-4 self-start"
    >
      Try again
    </Button>
  );
}
