import ChatWidget from "@/components/chat/chat-widget";
import { HomeShell } from "@/components/home-shell";
import { getLinksForCurrentUser } from "@/lib/links";
import { groupLinksByDate, LinkGroup as LinkGroupType } from "@/utils/links";

export default async function Home() {
  const links = await getLinksForCurrentUser();

  const groups: LinkGroupType[] = groupLinksByDate(links);

  return (
    <div className="wrapper-private flex-1 flex flex-col gap-8 pt-24 pb-32">
      <HomeShell groups={groups} />
      <div className="fixed bottom-8 right-8">
        <ChatWidget />
      </div>
    </div>
  );
}
