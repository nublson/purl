import Header from "@/components/header";
import { HeaderSearchLinks } from "@/components/header-search-links";
import { UploadFile } from "@/components/upload-file";
import { User } from "@/components/user";
import { HeaderActionsFallback } from "@/components/skeletons";
import { getLinksForCurrentUser } from "@/lib/links";
import type { Metadata } from "next";
import { Fragment, Suspense } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

async function HeaderActions() {
  const links = await getLinksForCurrentUser();
  return (
    <div className="flex items-center justify-end gap-2">
      <HeaderSearchLinks links={links} />
      <UploadFile />
      <User />
    </div>
  );
}

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <Header pathname="/home">
        <Suspense fallback={<HeaderActionsFallback />}>
          <HeaderActions />
        </Suspense>
      </Header>
      <main className="flex-1 flex flex-col items-center justify-start pt-6 overflow-y-auto px-4 md:px-0">
        {children}
      </main>
    </Fragment>
  );
}
