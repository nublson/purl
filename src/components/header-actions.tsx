"use client";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { Fragment } from "react";
import { HeaderActionsFallback } from "@/components/skeletons";

export default function HeaderActions() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <HeaderActionsFallback />;
  }

  return (
    <div className="flex items-center gap-2">
      {session ? (
        <Button size="sm" variant="outline" asChild>
          <Link href="/home">Dashboard</Link>
        </Button>
      ) : (
        <Fragment>
          <Button size="sm" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </Fragment>
      )}
    </div>
  );
}
