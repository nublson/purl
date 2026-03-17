"use client";

import { LinkGroup } from "@/components/link-group";
import { PasteHandler } from "@/components/paste-handler";
import { LinkItemSkeleton } from "@/components/skeletons";
import type { LinkGroup as LinkGroupType } from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

export function HomeShell({ groups }: { groups: LinkGroupType[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const onPasteStart = useCallback((url: string) => {
    setPendingUrl(url);
  }, []);

  const onSaveSuccess = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const onSaveError = useCallback(() => {
    setPendingUrl(null);
  }, []);

  useEffect(() => {
    if (!isPending) queueMicrotask(() => setPendingUrl(null));
  }, [isPending]);

  const showSkeleton = pendingUrl !== null || isPending;
  const skeletonUrl = pendingUrl ?? "";
  const showSyntheticToday = showSkeleton && !groups.length;

  return (
    <>
      <PasteHandler
        onPasteStart={onPasteStart}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
      />
      {!groups.length && !showSyntheticToday ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <PackageOpen className="text-neutral-800 size-16" />
        </div>
      ) : (
        <>
          {showSyntheticToday && (
            <LinkGroup
              label="Today"
              links={[]}
              prependItems={<LinkItemSkeleton url={skeletonUrl} />}
            />
          )}
          {groups.map((group) => (
            <LinkGroup
              key={group.label}
              label={group.label}
              links={group.links}
              prependItems={
                group.label === "Today" && showSkeleton ? (
                  <LinkItemSkeleton url={skeletonUrl} />
                ) : undefined
              }
            />
          ))}
        </>
      )}
    </>
  );
}
