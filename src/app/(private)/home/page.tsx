import { HomeShell } from "@/components/home-shell";
import { getLinksForCurrentUser } from "@/lib/links";
import { groupLinksByDate, LinkGroup as LinkGroupType } from "@/utils/links";

export default async function Home() {
  const links = await getLinksForCurrentUser();

  const groups: LinkGroupType[] = groupLinksByDate(links);

  return (
    <div className="wrapper-private flex min-h-0 flex-1 flex-col gap-8 pt-24 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <HomeShell groups={groups} />
    </div>
  );
}
