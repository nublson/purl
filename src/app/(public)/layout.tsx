import Footer from "@/components/footer";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Fragment } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <Fragment>
      <Header>
        <div className="flex items-center gap-2">
          {session ? (
            <Button size="sm" variant={"outline"} asChild>
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
      </Header>
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-6 lg:px-12">
        {children}
      </main>
      <Footer />
    </Fragment>
  );
}
