import ChatWidget from "@/components/chat/chat-widget";
import { HomeShell } from "@/components/home-shell";
import { ChatProvider } from "@/contexts/chat-context";
import { getLinksForCurrentUser } from "@/lib/links";
import { groupLinksByDate, LinkGroup as LinkGroupType } from "@/utils/links";

export default async function Home() {
  const links = await getLinksForCurrentUser();

  const groups: LinkGroupType[] = groupLinksByDate(links);

  return (
    <ChatProvider>
      <div className="wrapper-private flex-1 flex flex-col gap-8 pt-24 pb-32">
        <HomeShell groups={groups} />
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8">
          <ChatWidget />
        </div>
      </div>
    </ChatProvider>
  );
}
