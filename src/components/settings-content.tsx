"use client";

import { useUsage } from "@/hooks/use-usage";
import { SettingsAccount } from "./settings-account";
import { SettingsIntegrations } from "./settings-integrations";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";

export default function SettingsContent({
  closeDialog,
}: {
  closeDialog: () => void;
}) {
  const { usageSummary } = useUsage();

  return (
    <SettingsTabs
      tabs={[
        {
          label: "Usage",
          value: "usage",
          content: <SettingsUsage data={usageSummary} />,
        },
        {
          label: "Integrations",
          value: "integrations",
          content: <SettingsIntegrations />,
        },
        {
          label: "Account",
          value: "account",
          content: <SettingsAccount closeDialog={closeDialog} />,
        },
      ]}
    />
  );
}
