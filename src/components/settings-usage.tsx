import { Typography } from "@/components/typography";
import type { UsageMeterData } from "@/components/usage-item";
import { UsageItem } from "@/components/usage-item";
import { formatBytes } from "@/utils/format-bytes";

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

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <UsageItem label="Links" used={data.saves.used} cap={data.saves.cap} />
      <UsageItem
        label="Storage"
        used={data.storage.used}
        cap={data.storage.cap}
        format={formatBytes}
      />
    </div>
  );
}
