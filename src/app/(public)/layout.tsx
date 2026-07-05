import Footer from "@/components/footer";
import Header from "@/components/header";
import { PublicHeaderActions } from "@/components/public-header-actions-loader";
import { Fragment } from "react";

// Keep this JSX in sync with the sibling layout at src/app/oauth/layout.tsx
// (which reproduces this chrome but can't use force-static -- see its comment).
export const dynamic = "force-static";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <Header pathname="/" actions={<PublicHeaderActions />} />
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-4 md:px-6 lg:px-12">
        {children}
      </main>
      <Footer />
    </Fragment>
  );
}
