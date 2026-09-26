import Header from "@/components/header";
import { HeaderSaveLink } from "@/components/header-save-link";
import { HeaderSearchLinks } from "@/components/header-search-links";
import { HeaderActionsFallback } from "@/components/skeletons";
import { User } from "@/components/user";
import { CurrentUserProvider } from "@/contexts/current-user-context";
import { LinksSyncProvider } from "@/contexts/links-sync-context";
import { UsageProvider } from "@/contexts/usage-context";
import { getSessionUser } from "@/lib/session";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import { Suspense } from "react";

async function HeaderActions() {
  const user = await getSessionUser();
  const usageSummary = user ? await getUsageSummaryForUser(user.id) : null;

  return (
    <CurrentUserProvider user={user}>
      <UsageProvider usageSummary={usageSummary}>
        <div className="flex items-center justify-end gap-2">
          <HeaderSaveLink />
          <HeaderSearchLinks />
          <User />
        </div>
      </UsageProvider>
    </CurrentUserProvider>
  );
}

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Wraps header and page: header search and the usage meter follow link
  // changes made in the list, and vice versa.
  return (
    <LinksSyncProvider>
      <Header
        pathname="/home"
        actions={
          <Suspense fallback={<HeaderActionsFallback />}>
            <HeaderActions />
          </Suspense>
        }
      />
      <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-4 md:px-0">
        {children}
      </main>
    </LinksSyncProvider>
  );
}
