import { ByokKeyItem } from "@/components/byok-key-item";
import { TrialBanner } from "@/components/trial-banner";
import { Typography } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import type { UsageMeterData } from "@/components/usage-item";
import { UsageItem } from "@/components/usage-item";

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

  const trialEndsAt = data.effectivePlanKey === "PRO_TRIAL" ? data.trialEndsAt : null;

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <TrialBanner trialEndsAt={trialEndsAt} />
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
      <Separator />
      <ByokKeyItem />
    </div>
  );
}
