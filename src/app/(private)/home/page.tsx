import { LinkGroup } from "@/components/link-group";
import { PasteHandler } from "@/components/paste-handler";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  groupLinksByDate,
  Link,
  LinkGroup as LinkGroupType,
} from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { headers } from "next/headers";

function mapRowToLink(row: {
  id: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
  createdAt: Date;
}): Link {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    favicon: row.favicon,
    domain: row.domain,
    createdAt: row.createdAt,
  };
}

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

  const rows = await prisma.link.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  const links: Link[] = rows.map(mapRowToLink);
  const groups: LinkGroupType[] = groupLinksByDate(links);

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
