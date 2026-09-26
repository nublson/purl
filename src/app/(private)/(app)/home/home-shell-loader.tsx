import { HomeShell } from "@/components/home-shell";
import { HOME_LINKS_PAGE_SIZE } from "@/lib/limits";
import { getLinksPageForCurrentUser } from "@/lib/links";
import { getSessionUser } from "@/lib/session";
import { getRequestTimeZone } from "@/lib/time-zone";
import { groupLinksByDate } from "@/utils/links";

export async function HomeShellLoader() {
  const [{ links, nextCursor }, user, timeZone] = await Promise.all([
    getLinksPageForCurrentUser(HOME_LINKS_PAGE_SIZE),
    getSessionUser(),
    getRequestTimeZone(),
  ]);
  return (
    <HomeShell
      userId={user?.id ?? null}
      initialGroups={groupLinksByDate(links, { timeZone })}
      initialNextCursor={nextCursor}
      timeZone={timeZone}
    />
  );
}
