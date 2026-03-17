import { LinkGroup } from "@/components/link-group";
import { PasteHandler } from "@/components/paste-handler";
import { auth } from "@/lib/auth";
import {
  groupLinksByDate,
  LinkGroup as LinkGroupType,
} from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return (
      <div className="wrapper flex-1 flex flex-col gap-8 pb-32">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <PackageOpen className="text-neutral-800 size-16" />
        </div>
      </div>
    );
  }

  // TODO: Load links from your database when Prisma is set up.
  const groups: LinkGroupType[] = groupLinksByDate([]);

  return (
    <div className="wrapper flex-1 flex flex-col gap-8 pb-32">
      <PasteHandler />
      {!groups.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <PackageOpen className="text-neutral-800 size-16" />
        </div>
      ) : (
        groups.map((group) => (
          <LinkGroup
            key={group.label}
            label={group.label}
            links={group.links}
          />
        ))
      )}
    </div>
  );
}
