"use client";

import { useForm } from "@tanstack/react-form";
import { focusFirstInvalid } from "@/lib/focus-first-invalid";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { DialogClose, DialogFooter } from "./ui/dialog";
import { Field, FieldGroup } from "./ui/field";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface FeedbackFormProps {
  onSuccess: () => void;
}

export default function FeedbackForm({ onSuccess }: FeedbackFormProps) {
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
          toast.error("Too many requests. Try again in a minute.");
          return;
        }

        if (!res.ok) {
          let message = "Unable to send feedback. Try again.";
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
        toast.error("Unable to send feedback. Check your connection and try again.");
      }
    },
  });

  return (
    <form
      className=" flex flex-col gap-6 px-6 pt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const formElement = e.currentTarget;
        await form.handleSubmit();
        focusFirstInvalid(formElement);
      }}
    >
      <FieldGroup>
        <form.Field
          name="feedback"
          validators={{
            onSubmit: ({ value }) =>
              !value?.trim() ? "Write your feedback before sending." : undefined,
          }}
        >
          {(field) => (
            <Field>
              <Label htmlFor={field.name} className="sr-only">
                Feedback
              </Label>
              <Textarea
                id={field.name}
                name={field.name}
                rows={4}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                autoComplete="off"
                autoFocus
                disabled={form.state.isSubmitting}
                className="max-h-36"
                aria-invalid={field.state.meta.errors?.length ? true : undefined}
                aria-describedby={
                  field.state.meta.errors?.length
                    ? `${field.name}-error`
                    : undefined
                }
              />
              {field.state.meta.errors?.length ? (
                <p id={`${field.name}-error`} className="text-sm text-destructive">
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
}
