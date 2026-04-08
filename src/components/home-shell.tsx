"use client";

import { LinkGroup } from "@/components/link-group";
import { LinkInput } from "@/components/link-input";
import { PasteHandler } from "@/components/paste-handler";
import { LinkItemSkeleton } from "@/components/skeletons";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import {
  UPLOAD_ERROR_EVENT,
  UPLOAD_START_EVENT,
  UPLOAD_SUCCESS_EVENT,
  type UploadStartDetail,
  type UploadSuccessDetail,
} from "@/utils/upload-events";
import type { LinkGroup as LinkGroupType } from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

export function HomeShell({ groups }: { groups: LinkGroupType[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  useRealtimeSync(startTransition);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [prevTodayCount, setPrevTodayCount] = useState(0);
  const [newLinkId, setNewLinkId] = useState<string | null>(null);

  const onPasteStart = useCallback((url: string) => {
    setPendingUrl(url);
  }, []);

  const onSaveSuccess = useCallback(
    (id: string) => {
      setNewLinkId(id);
      startTransition(() => {
        router.refresh();
      });
    },
    [router],
  );

  const onSaveError = useCallback(() => {
    setPendingUrl(null);
  }, []);

  const todayGroup = groups.find((g) => g.label === "Today");
  const todayLinksCount = todayGroup?.links.length ?? 0;
  const newDataArrived = !isPending && todayLinksCount > prevTodayCount;

  // Only show the optimistic row when this device pasted a URL — not when
  // isPending is true from useRealtimeSync (remote refresh has no pendingUrl).
  const showSkeleton = pendingUrl !== null && !newDataArrived;
  const skeletonUrl = pendingUrl ?? "";
  const showSyntheticToday = showSkeleton && !todayGroup;

  useEffect(() => {
    if (!isPending) {
      queueMicrotask(() => {
        setPendingUrl(null);
        setNewLinkId(null);
        setPrevTodayCount(todayLinksCount);
      });
    }
  }, [isPending, todayLinksCount]);

  useEffect(() => {
    const onUploadStart = (event: Event) => {
      const customEvent = event as CustomEvent<UploadStartDetail>;
      onPasteStart(customEvent.detail?.label ?? "Uploading file...");
    };
    const onUploadSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<UploadSuccessDetail>;
      const id = customEvent.detail?.id;
      if (id) {
        onSaveSuccess(id);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    };
    const onUploadError = () => {
      onSaveError();
    };

    window.addEventListener(UPLOAD_START_EVENT, onUploadStart);
    window.addEventListener(UPLOAD_SUCCESS_EVENT, onUploadSuccess);
    window.addEventListener(UPLOAD_ERROR_EVENT, onUploadError);

    return () => {
      window.removeEventListener(UPLOAD_START_EVENT, onUploadStart);
      window.removeEventListener(UPLOAD_SUCCESS_EVENT, onUploadSuccess);
      window.removeEventListener(UPLOAD_ERROR_EVENT, onUploadError);
    };
  }, [onPasteStart, onSaveError, onSaveSuccess, router, startTransition]);

  return (
    <>
      <LinkInput
        onSaveStart={onPasteStart}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
      />
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
              prependItems={<LinkItemSkeleton url={skeletonUrl} animateIn />}
            />
          )}
          {groups.map((group) => (
            <LinkGroup
              key={group.label}
              label={group.label}
              links={group.links}
              newLinkId={group.label === "Today" ? newLinkId : undefined}
              prependItems={
                group.label === "Today" && showSkeleton ? (
                  <LinkItemSkeleton url={skeletonUrl} animateIn />
                ) : undefined
              }
            />
          ))}
        </>
      )}
    </>
  );
}
