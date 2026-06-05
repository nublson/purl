"use client";

import type { PlanKey } from "@/generated/prisma/enums";
import { createContext, type ReactNode } from "react";

export interface PlanContextValue {
  effectivePlanKey: PlanKey | null;
}

export const PlanContext = createContext<PlanContextValue>({
  effectivePlanKey: null,
});

export function PlanProvider({
  effectivePlanKey,
  children,
}: {
  effectivePlanKey: PlanKey | null;
  children: ReactNode;
}) {
  return (
    <PlanContext.Provider value={{ effectivePlanKey }}>
      {children}
    </PlanContext.Provider>
  );
}
