import Header from "@/components/header";
import { HeaderSearchLinks } from "@/components/header-search-links";
import { NavigationTabs } from "@/components/navigation-tabs";
import { HeaderActionsFallback } from "@/components/skeletons";
import { UploadFile } from "@/components/upload-file";
import { User } from "@/components/user";
import { UsageProvider } from "@/contexts/usage-context";
import { auth } from "@/lib/auth";
import { getLinksForCurrentUser } from "@/lib/links";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import { headers } from "next/headers";
import { Suspense } from "react";

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

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header
        pathname="/home"
        actions={
          <Suspense fallback={<HeaderActionsFallback variant="private" />}>
            <HeaderActions />
          </Suspense>
        }
      />
      <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-4 md:px-0">
        {children}
        <NavigationTabs />
      </main>
    </>
  );
}
