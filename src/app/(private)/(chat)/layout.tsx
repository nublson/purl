import HeaderChat from "@/components/header-chat";
import { Fragment } from "react";

export default function ChatShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <HeaderChat />
      <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-4 md:px-0">
        {children}
      </main>
    </Fragment>
  );
}
