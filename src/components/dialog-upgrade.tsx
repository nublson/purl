"use client";

import * as React from "react";
import ApiKeyForm from "./api-key-form";
import { DialogWrapper } from "./dialog-wrapper";

interface UpgradeDialogProps {
  children: React.ReactNode;
}

export const UpgradeDialog = ({ children }: UpgradeDialogProps) => {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Upgrade"
      description="Enable Pro features by adding your OpenAI API key."
      open={open}
      onOpenChange={setOpen}
      content={<ApiKeyForm />}
    >
      {children}
    </DialogWrapper>
  );
};
