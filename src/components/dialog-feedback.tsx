"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { Skeleton } from "./ui/skeleton";

// Loaded when the dialog first opens: keeps the form library off /home's
// initial bundle.
const FeedbackForm = dynamic(() => import("./feedback-form"), {
  loading: () => (
    <div className="px-6 pt-6">
      <Skeleton className="h-24 w-full" />
    </div>
  ),
});

interface FeedbackDialogProps {
  children: React.ReactNode;
}

export const FeedbackDialog = ({ children }: FeedbackDialogProps) => {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Feedback"
      description="Tell me what’s working, what isn’t, or what you’d like next."
      open={open}
      onOpenChange={setOpen}
      content={<FeedbackForm onSuccess={() => setOpen(false)} />}
    >
      {children}
    </DialogWrapper>
  );
};
