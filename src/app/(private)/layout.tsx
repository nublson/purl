import Header from "@/components/header";
import SearchLinks from "@/components/search-links";
import { UploadFile } from "@/components/upload-file";
import { User } from "@/components/user";
import { getLinksForCurrentUser } from "@/lib/links";
import type { Metadata } from "next";
import { Fragment } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const links = await getLinksForCurrentUser();

  return (
    <Fragment>
      <Header pathname="/home">
        <div className="flex items-center justify-end gap-2">
          <SearchLinks links={links} />
          <UploadFile />
          <User />
        </div>
      </Header>
      <main className="flex-1 flex flex-col items-center justify-start pt-6 overflow-y-auto px-4 md:px-0">
        {children}
      </main>
    </Fragment>
  );
}
