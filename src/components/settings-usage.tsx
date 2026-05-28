import { Typography } from "@/components/typography";
import type { UsageMeterData } from "@/components/usage-item";
import { UsageItem } from "@/components/usage-item";

function trialDaysRemaining(trialEndsAt: Date): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function SettingsUsage({ data }: { data: UsageMeterData | null }) {
  if (!data) {
    return (
      <div className="w-full flex-1 flex flex-col gap-4">
        <Typography size="small" className="text-muted-foreground">
          Usage details are unavailable right now.
        </Typography>
      </div>
    );
  }

  const isTrial = data.effectivePlanKey === "PRO_TRIAL" && data.trialEndsAt != null;
  const daysLeft = isTrial ? trialDaysRemaining(new Date(data.trialEndsAt!)) : null;

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      {isTrial && (
        <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
          <Typography size="small" className="text-muted-foreground">
            {daysLeft === 0
              ? "Your free trial ends today. Upgrade to keep AI access."
              : `Free trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining.`}
          </Typography>
        </div>
      )}
      <UsageItem
        label="Links"
        used={data.saves.used}
        cap={data.saves.cap}
      />
      <UsageItem
        label="Chats"
        period="month"
        used={data.chatMessages.used}
        cap={data.chatMessages.cap}
      />
      <UsageItem
        label="Extractions"
        period="month"
        used={data.extractions.used}
        cap={data.extractions.cap}
      />
    </div>
  );
}
