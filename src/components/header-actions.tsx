"use client";

import { HeaderActionsFallback } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { Fragment } from "react";

export default function HeaderActions() {
  const { isPending } = useSession();

  if (isPending) {
    return <HeaderActionsFallback />;
  }

  return (
    <div className="flex items-center gap-2">
      <Fragment>
        <Button aria-label="Sign in" size="sm" variant="outline" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button aria-label="Get started" size="sm" asChild>
          <Link href="/signup">Get started</Link>
        </Button>
      </Fragment>
    </div>
  );
}
