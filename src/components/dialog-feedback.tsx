"use client";

import { useForm } from "@tanstack/react-form";
import * as React from "react";
import { toast } from "sonner";
import { DialogWrapper } from "./dialog-wrapper";
import { Button } from "./ui/button";
import { DialogClose, DialogFooter } from "./ui/dialog";
import { Field, FieldGroup } from "./ui/field";
import { Textarea } from "./ui/textarea";

interface FeedbackDialogProps {
  children: React.ReactNode;
}

export const FeedbackDialog = ({ children }: FeedbackDialogProps) => {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Feedback"
      description="Please provide feedback on the app."
      open={open}
      onOpenChange={setOpen}
      content={<FeedbackForm onSuccess={() => setOpen(false)} />}
    >
      {children}
    </DialogWrapper>
  );
};

interface FeedbackFormProps {
  onSuccess: () => void;
}

const FeedbackForm = ({ onSuccess }: FeedbackFormProps) => {
  const form = useForm({
    defaultValues: {
      feedback: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ feedback: value.feedback.trim() }),
        });

        if (res.status === 429) {
          toast.error("Too many requests. Please try again in a minute.");
          return;
        }

        if (!res.ok) {
          let message = "Failed to send feedback";
          try {
            const data = (await res.json()) as { error?: string };
            if (typeof data.error === "string" && data.error) {
              message = data.error;
            }
          } catch {
            /* use default */
          }
          toast.error(message);
          return;
        }

        toast.success("Thanks for your feedback.");
        form.reset();
        onSuccess();
      } catch {
        toast.error("Failed to send feedback");
      }
    },
  });

  return (
    <form
      className=" flex flex-col gap-6 px-6 pt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field
          name="feedback"
          validators={{
            onSubmit: ({ value }) =>
              !value?.trim() ? "Feedback is required." : undefined,
          }}
        >
          {(field) => (
            <Field>
              <Textarea
                id={field.name}
                name={field.name}
                rows={4}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                autoComplete="off"
                disabled={form.state.isSubmitting}
                className="max-h-36"
              />
              {field.state.meta.errors?.length ? (
                <p
                  className="text-sm text-destructive"
                  role="alert"
                  aria-live="polite"
                >
                  {field.state.meta.errors.join(", ")}
                </p>
              ) : null}
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            disabled={form.state.isSubmitting}
          >
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={form.state.isSubmitting}>
          {form.state.isSubmitting ? "Sending…" : "Send feedback"}
        </Button>
      </DialogFooter>
    </form>
  );
};
