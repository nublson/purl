import { Typography } from "@/components/typography";
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

  console.log({ data });

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <UsageItem
        label="Saved links"
        used={data.saves.used}
        cap={data.saves.cap}
      />
      <UsageItem
        label={`Chat (${data.chatMessages.windowDays ?? 30}d)`}
        used={data.chatMessages.used}
        cap={data.chatMessages.cap}
      />
      <UsageItem
        label="Extractions / period"
        used={data.extractions.used}
        cap={data.extractions.cap}
      />
    </div>
  );
}
