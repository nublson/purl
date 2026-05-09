"use client";

import { Typography } from "@/components/typography";

export type UsageMeterData = {
  effectivePlanKey: string;
  trialEndsAt: string | null;
  saves: { used: number; cap: number | null };
  chatMessages: { used: number; cap: number | null; windowDays: number | null };
  extractions: { used: number; cap: number | null };
};

function Bar({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  if (cap == null) {
    return (
      <div className="flex flex-col gap-1">
        <Typography size="mini" className="text-muted-foreground">
          {label}: {used} (Pro)
        </Typography>
      </div>
    );
  }
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {used} / {cap}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UsageMeter({ data }: { data: UsageMeterData }) {
  const trialEnd = data.trialEndsAt ? new Date(data.trialEndsAt) : null;
  const trialBadge =
    data.effectivePlanKey === "PRO_TRIAL" && trialEnd && trialEnd > new Date()
      ? `Trial ends ${trialEnd.toLocaleDateString()}`
      : null;

  return (
    <div className="mb-6 flex w-full max-w-2xl flex-col gap-3 self-center rounded-xl border border-border bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography size="small" className="font-medium capitalize">
          Plan: {data.effectivePlanKey.toLowerCase().replace("_", " ")}
        </Typography>
        {trialBadge ? (
          <Typography size="mini" className="text-amber-600 dark:text-amber-400">
            {trialBadge}
          </Typography>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Bar label="Saved links" used={data.saves.used} cap={data.saves.cap} />
        <Bar
          label={`Chat (${data.chatMessages.windowDays ?? 30}d)`}
          used={data.chatMessages.used}
          cap={data.chatMessages.cap}
        />
        <Bar
          label="Extractions / period"
          used={data.extractions.used}
          cap={data.extractions.cap}
        />
      </div>
    </div>
  );
}
