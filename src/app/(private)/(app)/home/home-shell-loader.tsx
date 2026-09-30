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
    // `key` forces a remount (fresh `groups`/`nextCursor` state) when
    // navigating between /home and a folder page, or between two folder
    // pages — HomeShell otherwise keeps the previous view's list state.
    <HomeShell
      key="all"
      userId={user?.id ?? null}
      initialGroups={groupLinksByDate(links, { timeZone })}
      initialNextCursor={nextCursor}
      timeZone={timeZone}
    />
  );
}
