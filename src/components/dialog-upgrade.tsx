"use client";

import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";

interface UpgradeDialogProps {
  children: React.ReactNode;
}

export const UpgradeDialog = ({ children }: UpgradeDialogProps) => {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Upgrade"
      description="Paid plans and subscription options are coming soon."
      open={open}
      onOpenChange={setOpen}
    >
      {children}
    </DialogWrapper>
  );
};
