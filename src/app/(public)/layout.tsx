import Footer from "@/components/footer";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <Header>
        <Button size="sm" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </Header>
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-12">
        {children}
      </main>
      <Footer />
    </Fragment>
  );
}
