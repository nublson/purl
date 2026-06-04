import { HomeShell } from "@/components/home-shell";
import { PlanProvider } from "@/contexts/plan-context";
import { auth } from "@/lib/auth";
import { getEntitlementContext } from "@/lib/entitlements";
import { getLinksForCurrentUser } from "@/lib/links";
import { headers } from "next/headers";
import { groupLinksByDate } from "@/utils/links";

export async function HomeShellLoader() {
  const [links, session] = await Promise.all([
    getLinksForCurrentUser(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const groups = groupLinksByDate(links);

  const userId = session?.user?.id;
  const { effectivePlanKey } = userId
    ? await getEntitlementContext(userId)
    : { effectivePlanKey: null };

  return (
    <PlanProvider effectivePlanKey={effectivePlanKey}>
      <HomeShell groups={groups} />
    </PlanProvider>
  );
}
