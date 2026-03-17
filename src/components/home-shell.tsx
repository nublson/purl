"use client";

import { LinkGroup } from "@/components/link-group";
import { PasteHandler } from "@/components/paste-handler";
import { LinkItemSkeleton } from "@/components/skeletons";
import type { LinkGroup as LinkGroupType } from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { useCallback, useState } from "react";

export function HomeShell({ groups }: { groups: LinkGroupType[] }) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const onPasteStart = useCallback((url: string) => {
    setPendingUrl(url);
  }, []);

  const onPasteEnd = useCallback(() => {
    setPendingUrl(null);
  }, []);

  const showSyntheticToday = pendingUrl && !groups.length;

  return (
    <>
      <PasteHandler onPasteStart={onPasteStart} onPasteEnd={onPasteEnd} />
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
              prependItems={<LinkItemSkeleton url={pendingUrl ?? ""} />}
            />
          )}
          {groups.map((group) => (
            <LinkGroup
              key={group.label}
              label={group.label}
              links={group.links}
              prependItems={
                group.label === "Today" && pendingUrl ? (
                  <LinkItemSkeleton url={pendingUrl} />
                ) : undefined
              }
            />
          ))}
        </>
      )}
    </>
  );
}
