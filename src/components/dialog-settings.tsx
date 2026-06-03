"use client";

import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { SettingsAccount } from "./settings-account";
import { SettingsIntegrations } from "./settings-integrations";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";
import { Badge } from "./ui/badge";
import type { UsageMeterData } from "./usage-item";

interface SettingsDialogProps {
  children: React.ReactNode;
  usageSummary?: UsageMeterData | null;
}

export function SettingsDialog({
  children,
  usageSummary = null,
}: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      className="md:min-w-xl"
      open={open}
      onOpenChange={setOpen}
      title="Settings"
      description="Manage your settings"
      content={
        <SettingsContent
          closeDialog={() => setOpen(false)}
          usageSummary={usageSummary}
        />
      }
    >
      {children}
    </DialogWrapper>
  );
}

function SettingsContent({
  closeDialog,
  usageSummary,
}: {
  closeDialog: () => void;
  usageSummary: UsageMeterData | null;
}) {
  const isTrial = usageSummary?.effectivePlanKey === "PRO_TRIAL";

  return (
    <SettingsTabs
      tabs={[
        {
          label: "Usage",
          value: "usage",
          badge: isTrial ? (
            <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0">
              Trial
            </Badge>
          ) : undefined,
          content: <SettingsUsage data={usageSummary} />,
        },
        {
          label: "Account",
          value: "account",
          content: <SettingsAccount closeDialog={closeDialog} />,
        },
        {
          label: "Integrations",
          value: "integrations",
          content: <SettingsIntegrations />,
        },
      ]}
    />
  );
}
