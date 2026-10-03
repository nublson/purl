import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * A shared link that doesn't open: the folder was made private, deleted, or
 * never existed. Says the same for all three, so a private folder can't be
 * told apart from a missing one.
 */
export default function SharedFolderNotFound() {
  return (
    <div className="wrapper-center gap-6 px-4 text-center">
      <Logo size={44} />
      <div className="flex flex-col gap-2">
        <Typography variant="h3" component="h1">
          This folder isn’t available
        </Typography>
        <Typography size="small" className="max-w-xs text-balance">
          It may have been made private or deleted. Check the link with the
          person who shared it.
        </Typography>
      </div>
      <Button variant="outline" asChild>
        <Link href="/">Go to Purl</Link>
      </Button>
    </div>
  );
}
