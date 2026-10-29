"use client";

import type { UsageMeterData } from "@/components/usage-item";
import { useLinksSyncState } from "@/hooks/use-links-sync";
import { USAGE_CHANGED_EVENT } from "@/lib/usage-events";
import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface UsageContextValue {
  usageSummary: UsageMeterData | null;
}

export const UsageContext = createContext<UsageContextValue>({
  usageSummary: null,
});

function isMeter(value: unknown): value is { used: number; cap: number } {
  if (typeof value !== "object" || value === null) return false;
  const { used, cap } = value as Record<string, unknown>;
  return typeof used === "number" && typeof cap === "number";
}

function isUsageSummary(value: unknown): value is UsageMeterData {
  if (typeof value !== "object" || value === null) return false;
  const { saves, storage } = value as Record<string, unknown>;
  return isMeter(saves) && isMeter(storage);
}

export function UsageProvider({
  usageSummary: serverUsageSummary,
  children,
}: {
  usageSummary: UsageMeterData | null;
  children: ReactNode;
}) {
  // Storage changes with uploads and deletes, which don't refresh the route:
  // on `requestUsageRefresh()` the summary is fetched again. Kept with the
  // server summary it replaces, so a newer server render wins over it.
  const [fetched, setFetched] = useState<{
    base: UsageMeterData;
    summary: UsageMeterData;
  } | null>(null);

  useEffect(() => {
    if (!serverUsageSummary) return;
    let controller: AbortController | null = null;
    const refetch = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const res = await fetch("/api/user/usage", {
          cache: "no-store",
          signal: current.signal,
        });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!current.signal.aborted && isUsageSummary(data)) {
          setFetched({ base: serverUsageSummary, summary: data });
        }
      } catch {
        // Aborted or offline: keep what's shown until the next change.
      }
    };
    const onChange = () => void refetch();
    window.addEventListener(USAGE_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(USAGE_CHANGED_EVENT, onChange);
      controller?.abort();
    };
  }, [serverUsageSummary]);

  // The link list reloads client-side (no route refresh), so prefer the saved
  // count from its latest reload over the server-rendered (or fetched) one.
  const { total } = useLinksSyncState();
  const value = useMemo(() => {
    const summary =
      fetched && fetched.base === serverUsageSummary
        ? fetched.summary
        : serverUsageSummary;
    return {
      usageSummary:
        summary && total !== null
          ? { ...summary, saves: { ...summary.saves, used: total } }
          : summary,
    };
  }, [fetched, serverUsageSummary, total]);

  return (
    <UsageContext.Provider value={value}>{children}</UsageContext.Provider>
  );
}
