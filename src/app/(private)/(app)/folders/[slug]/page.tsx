import { LinkViewFrame } from "@/components/link-view-frame";
import { HomeSkeleton } from "@/components/skeletons/home";
import { CurrentFolderProvider } from "@/contexts/current-folder-context";
import { getFolderBySlug, type FolderSummary } from "@/lib/folders";
import { getSessionUser } from "@/lib/session";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { FolderShellLoader } from "./folder-shell-loader";

type FolderPageParams = { slug: string };

// `getFolderBySlug` isn't itself request-deduplicated (unlike
// `getSessionUser`), and both `generateMetadata` and the page component look
// up the same folder for the same request — wrap it so that pair shares one
// DB query instead of issuing it twice.
const getFolderForRequest = cache(
  async (userId: string, slug: string): Promise<FolderSummary | null> =>
    getFolderBySlug(userId, slug),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<FolderPageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await getSessionUser();
  const folder = user ? await getFolderForRequest(user.id, slug) : null;
  return { title: folder?.name ?? "Folder" };
}

export default async function FolderPage({
  params,
}: {
  params: Promise<FolderPageParams>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  const folder = user ? await getFolderForRequest(user.id, slug) : null;

  if (!folder) {
    notFound();
  }

  return (
    <LinkViewFrame>
      {/* Folder header / empty-state slot: the user's header (rename/delete,
          switcher) and empty state are wired in here in a follow-up pass.
          Until then, this heading only covers accessibility/SEO. */}
      <h1 className="sr-only">{folder.name}</h1>
      {/* Hands the server-resolved folder to the client subtree so
          `useCurrentFolder()` files saves here by id, even if the client
          folder list no longer matches this URL's slug (renamed/deleted in
          another tab). */}
      <CurrentFolderProvider folder={folder}>
        <Suspense fallback={<HomeSkeleton />}>
          <FolderShellLoader folderId={folder.id} />
        </Suspense>
      </CurrentFolderProvider>
    </LinkViewFrame>
  );
}
