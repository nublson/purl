"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { Skeleton } from "./ui/skeleton";

// Loaded when the dialog first opens: the tabs (usage, integrations, account)
// stay off /home's initial bundle.
const SettingsContent = dynamic(() => import("./settings-content"), {
  loading: () => (
    <div className="flex flex-col gap-4 px-6">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  ),
});

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
