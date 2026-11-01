import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReaderContent } from "@/components/reader-content";
import { ReaderRetryButton } from "@/components/reader-retry-button";
import { Typography } from "@/components/typography";
import { qualifiesForReader, readerStateMessage } from "@/lib/reader-view";
import { readReaderViewForUser } from "@/lib/reader-views";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { getSessionUser } from "@/lib/session";
import { formatUpdatedDate } from "@/utils/formatter";

export const dynamic = "force-dynamic";

const load = cache(async (id: string) => {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return readReaderViewForUser(user.id, id);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const found = await load(id);
  return {
    title: found?.link.title,
    robots: { index: false, follow: false },
  };
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await load(id);
  if (!found) notFound();
  const { link, view } = found;

  const qualifies = qualifiesForReader({
    contentType: link.contentType,
    upload: link.fileKey !== null,
  });
  const ready = qualifies && view?.status === "READY" && view.markdown;
  const favicon = safeRemoteImgSrc(link.favicon);

  return (
    <>
      <Typography
        size="small"
        className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 md:mt-10"
      >
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" width={16} height={16} className="size-4 rounded-sm" />
        ) : null}
        <span>{link.domain}</span>
        <Typography
          component="a"
          size="small"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Open original
        </Typography>
        {ready && view.fetchedAt ? (
          <span>Reader view from {formatUpdatedDate(view.fetchedAt.toISOString())}</span>
        ) : null}
      </Typography>
      <Typography variant="h1" component="h1" className="mt-4">
        {link.title}
      </Typography>
      {ready ? (
        <ReaderContent
          markdown={view.markdown!}
          truncated={view.truncated}
          pageUrl={link.url}
        />
      ) : (
        <>
          <Typography className="mt-8">
            {qualifies
              ? readerStateMessage(
                  view
                    ? {
                        status: view.status,
                        reason: view.reason,
                        fetchedAt: view.fetchedAt?.toISOString() ?? null,
                      }
                    : null,
                  { short: false },
                )
              : "This pearl has no reader view."}
          </Typography>
          {qualifies && view?.status === "FAILED" ? (
            <ReaderRetryButton linkId={id} />
          ) : null}
        </>
      )}
    </>
  );
}
