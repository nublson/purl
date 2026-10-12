"use client";

import { useUsage } from "@/hooks/use-usage";
import { SettingsAccount } from "./settings-account";
import { SettingsImport } from "./settings-import";
import { SettingsIntegrations } from "./settings-integrations";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";

export default function SettingsContent({
  closeDialog,
  defaultTab,
}: {
  closeDialog: () => void;
  defaultTab?: string;
}) {
  const { usageSummary } = useUsage();

  return (
    <SettingsTabs
      defaultValue={defaultTab}
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
          label: "Import",
          value: "import",
          content: (
            <SettingsImport usage={usageSummary} closeDialog={closeDialog} />
          ),
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
