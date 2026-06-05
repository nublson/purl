"use client";

import type { UsageMeterData } from "@/components/usage-item";
import { createContext, type ReactNode } from "react";

export interface UsageContextValue {
  usageSummary: UsageMeterData | null;
}

export const UsageContext = createContext<UsageContextValue>({
  usageSummary: null,
});

export function UsageProvider({
  usageSummary,
  children,
}: {
  usageSummary: UsageMeterData | null;
  children: ReactNode;
}) {
  return (
    <UsageContext.Provider value={{ usageSummary }}>
      {children}
    </UsageContext.Provider>
  );
}
