"use client";

import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { SettingsAccount } from "./settings-account";
import { SettingsTabs } from "./settings-tabs";

interface SettingsDialogProps {
  children: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      className="md:min-w-xl"
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
  return (
    <SettingsTabs
      tabs={[
        {
          label: "Account",
          value: "account",
          content: <SettingsAccount closeDialog={closeDialog} />,
        },
      ]}
    />
  );
}
