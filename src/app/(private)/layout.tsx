import Header from "@/components/header";
import { HeaderSearchLinks } from "@/components/header-search-links";
import { NavigationTabs } from "@/components/navigation-tabs";
import { HeaderActionsFallback } from "@/components/skeletons";
import { UploadFile } from "@/components/upload-file";
import { User } from "@/components/user";
import { ChatProvider } from "@/contexts/chat-context";
import { UsageProvider } from "@/contexts/usage-context";
import { auth } from "@/lib/auth";
import { getLinksForCurrentUser } from "@/lib/links";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

async function HeaderActions() {
  const [links, session] = await Promise.all([
    getLinksForCurrentUser(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const userId = session?.user?.id;
  const usageSummary = userId ? await getUsageSummaryForUser(userId) : null;

  return (
    <UsageProvider usageSummary={usageSummary}>
      <div className="flex items-center justify-end gap-2">
        <HeaderSearchLinks links={links} />
        <UploadFile className="hidden md:inline-flex" />
        <User />
      </div>
    </UsageProvider>
  );
}

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ChatProvider>
      <Header
        pathname="/home"
        actions={
          <Suspense fallback={<HeaderActionsFallback variant="private" />}>
            <HeaderActions />
          </Suspense>
        }
      />
      <main className="flex-1 flex flex-col items-center justify-start pt-4 overflow-y-auto px-4 md:px-0">
        {children}
        <NavigationTabs />
      </main>
    </ChatProvider>
  );
}
