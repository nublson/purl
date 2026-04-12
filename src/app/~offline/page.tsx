import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-6 p-6 text-center">
      <Typography component="h1" variant="h2">
        You&apos;re offline
      </Typography>
      <Typography className="text-muted-foreground max-w-md font-light">
        Purl needs a network connection to save links, sync your stash, and use
        AI chat. Reconnect and try again.
      </Typography>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
