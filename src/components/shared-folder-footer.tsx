import type { PublicOwner } from "@/lib/public-folders";
import Link from "next/link";
import { Logo } from "./logo";
import { BOTTOM_BAR_BAND } from "./omnibox-shell";
import { Typography } from "./typography";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

/**
 * A shared folder's footer, fixed at the bottom so it's in view however
 * long the list: "by [avatar] @username · Made with [logo] Purl", over the
 * search field's band of page background, so links fade away underneath.
 * Each mark sits inline before its name, sized to the text; a long
 * username truncates.
 */
export function SharedFolderFooter({ owner }: { owner: PublicOwner }) {
  return (
    <>
      <div aria-hidden className={BOTTOM_BAR_BAND} />
      <footer
        // A 44px row in the search field's spot, so the band is solid
        // exactly up to its top.
        className="fixed inset-x-0 bottom-[calc(1rem+var(--bottom-inset))] z-30 mx-auto flex h-11 w-fit max-w-[calc(100%-2rem)] items-center"
      >
        <Typography
          component="p"
          size="mini"
          className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap"
        >
          by
          <Typography
            component="span"
            size="mini"
            className="inline-flex min-w-0 items-center gap-1"
          >
            <Avatar className="size-4 shrink-0">
              {owner.image ? <AvatarImage src={owner.image} alt="" /> : null}
              <AvatarFallback className="text-[9px]">
                {owner.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Typography
              component="span"
              size="mini"
              className="truncate text-foreground"
            >
              @{owner.username}
            </Typography>
          </Typography>
          <Typography component="span" size="mini" aria-hidden>
            ·
          </Typography>
          Made with
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-1 text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {/* The word names the link; the logo is decoration here. */}
            <Typography component="span" aria-hidden className="flex">
              <Logo size={16} />
            </Typography>
            Purl
          </Link>
        </Typography>
      </footer>
    </>
  );
}
