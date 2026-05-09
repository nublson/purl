import { HomeShell } from "@/components/home-shell";
import { maybeNotifyTrialEnding } from "@/lib/billing-emails";
import { auth } from "@/lib/auth";
import { getLinksForCurrentUser } from "@/lib/links";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import { groupLinksByDate } from "@/utils/links";
import { headers } from "next/headers";

export async function HomeShellLoader() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const userId = session?.user?.id;
  if (userId) {
    await maybeNotifyTrialEnding(userId);
  }

  const links = await getLinksForCurrentUser();
  const groups = groupLinksByDate(links);
  const usageSummary = userId ? await getUsageSummaryForUser(userId) : null;

  return <HomeShell groups={groups} usageSummary={usageSummary} />;
}
