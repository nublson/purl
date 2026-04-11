import { HomeShell } from "@/components/home-shell";
import { getLinksForCurrentUser } from "@/lib/links";
import { groupLinksByDate } from "@/utils/links";

export async function HomeShellLoader() {
  const links = await getLinksForCurrentUser();
  const groups = groupLinksByDate(links);
  return <HomeShell groups={groups} />;
}
