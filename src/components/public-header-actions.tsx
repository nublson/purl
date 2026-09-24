import { Button } from "@/components/ui/button";
import Link from "next/link";

/** Static sign-in / sign-up actions for public pages (no session lookup needed). */
export function PublicHeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <Button aria-label="Sign in" size="sm" variant="outline" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
      <Button aria-label="Get started" size="sm" asChild>
        <Link href="/signup">Get started</Link>
      </Button>
    </div>
  );
}
