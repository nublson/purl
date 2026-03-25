import Footer from "@/components/footer";
import Header from "@/components/header";
import type { Metadata } from "next";
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
      <Header />
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-12">
        {children}
      </main>
      <Footer />
    </Fragment>
  );
}
