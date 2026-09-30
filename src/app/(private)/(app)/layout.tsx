import Header from "@/components/header";
import { HeaderSaveLink } from "@/components/header-save-link";
import { HeaderSearchLinks } from "@/components/header-search-links";
import { HeaderActionsFallback } from "@/components/skeletons";
import { User } from "@/components/user";
import { getEnabledProviders } from "@/lib/auth-providers";
import { CurrentUserProvider } from "@/contexts/current-user-context";
import { FoldersProvider } from "@/contexts/folders-context";
import { LinksSyncProvider } from "@/contexts/links-sync-context";
import { UsageProvider } from "@/contexts/usage-context";
import { listFoldersForUser } from "@/lib/folders";
import { getSessionUser } from "@/lib/session";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import { Suspense } from "react";

async function HeaderActions() {
  const user = await getSessionUser();
  const usageSummary = user ? await getUsageSummaryForUser(user.id) : null;
  const enabledProviders = getEnabledProviders();

  return (
    <CurrentUserProvider user={user} enabledProviders={enabledProviders}>
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

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `getSessionUser` is request-deduplicated (React `cache()`), so calling it
  // here too doesn't add a second lookup on top of `HeaderActions`' own call
  // below — it just lets us seed `FoldersProvider` (which wraps both the
  // header's save menu and the page) with the folder list up front, so
  // `useCurrentFolder()` is correct on the very first render instead of
  // racing the provider's own client-side fetch (see folders-context.tsx).
  const user = await getSessionUser();
  const initialFolders = user ? await listFoldersForUser(user.id) : [];

  // Wraps header and page: header search and the usage meter follow link
  // changes made in the list, and vice versa.
  return (
    <LinksSyncProvider>
      <FoldersProvider initialFolders={initialFolders}>
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
      </FoldersProvider>
    </LinksSyncProvider>
  );
}
