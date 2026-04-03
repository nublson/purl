import Footer from "@/components/footer";
import Header from "@/components/header";
import { PublicHeaderActions } from "@/components/public-header-actions-loader";
import { Fragment } from "react";

export const dynamic = "force-static";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <Header>
        <PublicHeaderActions />
      </Header>
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-4 md:px-6 lg:px-12">
        {children}
      </main>
      <Footer />
    </Fragment>
  );
}
