import Header from "@/components/header";
import { FoldersProvider } from "@/contexts/folders-context";
import { LinksSyncProvider } from "@/contexts/links-sync-context";
import { listFoldersForUser } from "@/lib/folders";
import { getSessionUser } from "@/lib/session";
import { getUsageSummaryForUser } from "@/lib/usage-summary";

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `getSessionUser` is request-deduplicated (React `cache()`), so calling it
  // here too doesn't add a second lookup on top of `HeaderActions`' own call
  // (in header.tsx) — it just lets us seed `FoldersProvider` (which wraps both
  // the header's folder selector/save menu and the page) with the folder list
  // up front, so
  // `useCurrentFolder()` is correct on the very first render instead of
  // racing the provider's own client-side fetch (see folders-context.tsx).
  const user = await getSessionUser();
  const [initialFolders, usageSummary] = user
    ? await Promise.all([
        listFoldersForUser(user.id),
        getUsageSummaryForUser(user.id),
      ])
    : [[], null];

  // Wraps header and page: the folder selector's counts and the usage meter
  // follow link changes made in the list, and vice versa.
  return (
    <LinksSyncProvider>
      <FoldersProvider
        initialFolders={initialFolders}
        initialTotalLinks={usageSummary?.saves.used ?? null}
      >
        <Header />
        <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-4 md:px-0">
          {children}
        </main>
      </FoldersProvider>
    </LinksSyncProvider>
  );
}
