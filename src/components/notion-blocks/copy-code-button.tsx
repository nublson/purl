"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy3 } from "reicon-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await copyToClipboard(code);
    } catch {
      return; // stays "Copy"
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={copied ? "Code copied" : "Copy code"}
        onClick={() => void copy()}
        className="relative h-8 cursor-pointer gap-1.5 px-2 text-xs text-foreground/70 after:absolute after:inset-x-0 pointer-coarse:after:-inset-y-1.5"
      >
        {copied ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Copy3 aria-hidden className="size-4" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Code copied" : ""}
      </span>
    </>
  );
}
