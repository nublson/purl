/**
 * Settings → Usage's numbers changed on the server (an upload landed, links
 * were deleted): `UsageProvider` refetches `GET /api/user/usage` on it.
 */
export const USAGE_CHANGED_EVENT = "purl:usage-changed";

/** Asks `UsageProvider` to refetch the usage summary. No-op on the server. */
export function requestUsageRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
}
