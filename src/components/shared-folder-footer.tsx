import type { PublicOwner } from "@/lib/public-folders";
import Link from "next/link";
import { Logo } from "./logo";
import { Typography } from "./typography";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

/**
 * The end of a shared folder: "Shared by [avatar] @username · Made with
 * [logo] Purl". Each mark sits inline before its name, sized to the text.
 */
export function SharedFolderFooter({ owner }: { owner: PublicOwner }) {
  return (
    <footer className="mt-16 flex justify-center">
      <Typography
        component="p"
        size="mini"
        className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1"
      >
        Shared by
        <Typography
          component="span"
          size="mini"
          className="inline-flex items-center gap-1 text-foreground"
        >
          <Avatar className="size-4">
            {owner.image ? <AvatarImage src={owner.image} alt="" /> : null}
            <AvatarFallback className="text-[9px]">
              {owner.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          @{owner.username}
        </Typography>
        <Typography component="span" size="mini" aria-hidden>
          ·
        </Typography>
        Made with
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          {/* The word names the link; the logo is decoration here. */}
          <Typography component="span" aria-hidden className="flex">
            <Logo size={16} />
          </Typography>
          Purl
        </Link>
      </Typography>
    </footer>
  );
}
