"use client";

import { useUsage } from "@/hooks/use-usage";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { SettingsAccount } from "./settings-account";
import { SettingsIntegrations } from "./settings-integrations";
import { SettingsPreferences } from "./settings-preferences";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";
import { Badge } from "./ui/badge";

interface SettingsDialogProps {
  children: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      className="dialog-top"
      open={open}
      onOpenChange={setOpen}
      title="Settings"
      description="Manage your settings"
      content={<SettingsContent closeDialog={() => setOpen(false)} />}
    >
      {children}
    </DialogWrapper>
  );
}

function SettingsContent({ closeDialog }: { closeDialog: () => void }) {
  const { usageSummary } = useUsage();
  const isTrial = usageSummary?.effectivePlanKey === "PRO_TRIAL";

  return (
    <SettingsTabs
      tabs={[
        {
          label: "Usage",
          value: "usage",
          badge: isTrial ? (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0"
            >
              Trial
            </Badge>
          ) : undefined,
          content: <SettingsUsage data={usageSummary} />,
        },
        {
          label: "Preferences",
          value: "preferences",
          content: <SettingsPreferences />,
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
