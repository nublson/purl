"use client";

import type { UsageMeterData } from "@/components/usage-item";
import { onLinksTotal } from "@/lib/links-events";
import { createContext, useEffect, useState, type ReactNode } from "react";

export interface UsageContextValue {
  usageSummary: UsageMeterData | null;
}

export const UsageContext = createContext<UsageContextValue>({
  usageSummary: null,
});

export function UsageProvider({
  usageSummary: initialUsageSummary,
  children,
}: {
  usageSummary: UsageMeterData | null;
  children: ReactNode;
}) {
  const [usageSummary, setUsageSummary] = useState(initialUsageSummary);

  // The link list reloads client-side (no route refresh), so keep the saved
  // count in sync from its reload responses.
  useEffect(
    () =>
      onLinksTotal((used) =>
        setUsageSummary((current) =>
          current ? { saves: { ...current.saves, used } } : current,
        ),
      ),
    [],
  );

  return (
    <UsageContext.Provider value={{ usageSummary }}>
      {children}
    </UsageContext.Provider>
  );
}
