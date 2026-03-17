import Header from "@/components/header";
import type { Metadata } from "next";
import { Fragment } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <Header />
      <main className="flex-1 flex flex-col items-center justify-start pt-6 overflow-y-auto">
        {children}
      </main>
    </Fragment>
  );
}
