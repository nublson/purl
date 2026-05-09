"use client";

import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { SettingsAccount } from "./settings-account";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";
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
  return (
    <SettingsTabs
      tabs={[
        {
          label: "Usage",
          value: "usage",
          content: <SettingsUsage data={usageSummary} />,
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
