"use client";

import type { UsageMeterData } from "@/components/usage-item";
import { useLinksSyncState } from "@/hooks/use-links-sync";
import { createContext, useMemo, type ReactNode } from "react";

export interface UsageContextValue {
  usageSummary: UsageMeterData | null;
}

export const UsageContext = createContext<UsageContextValue>({
  usageSummary: null,
});

export function UsageProvider({
  usageSummary: serverUsageSummary,
  children,
}: {
  usageSummary: UsageMeterData | null;
  children: ReactNode;
}) {
  // The link list reloads client-side (no route refresh), so prefer the saved
  // count from its latest reload over the server-rendered one.
  const { total } = useLinksSyncState();
  const value = useMemo(
    () => ({
      usageSummary:
        serverUsageSummary && total !== null
          ? { saves: { ...serverUsageSummary.saves, used: total } }
          : serverUsageSummary,
    }),
    [serverUsageSummary, total],
  );

  return (
    <UsageContext.Provider value={value}>{children}</UsageContext.Provider>
  );
}
