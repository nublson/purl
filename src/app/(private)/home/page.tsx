import { HomeShell } from "@/components/home-shell";
import { LinkInput } from "@/components/link-input";
import { getLinksForCurrentUser } from "@/lib/links";
import { groupLinksByDate, LinkGroup as LinkGroupType } from "@/utils/links";

export default async function Home() {
  const links = await getLinksForCurrentUser();

  const groups: LinkGroupType[] = groupLinksByDate(links);

  return (
    <div className="wrapper flex-1 flex flex-col gap-8 pb-32">
      <LinkInput />
      <HomeShell groups={groups} />
    </div>
  );
}
