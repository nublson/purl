"use client";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Link as LinkType } from "@/utils/links";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { focusFirstInvalid } from "@/lib/focus-first-invalid";
import { linksOriginHeaders } from "@/lib/links-origin";
import { useForm } from "@tanstack/react-form";
import * as React from "react";
import { toast } from "sonner";
import { DialogWrapper } from "./dialog-wrapper";
import { Typography } from "./typography";

interface EditDialogProps {
  link: LinkType;
  children: React.ReactNode;
}

export function EditDialog({ link, children }: EditDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Edit link"
      description="Update the title, description and notes for this link."
      open={open}
      onOpenChange={setOpen}
      content={<EditLinkForm link={link} onSuccess={() => setOpen(false)} />}
    >
      {children}
    </DialogWrapper>
  );
}

interface EditLinkFormProps {
  link: LinkType;
  onSuccess: () => void;
}

const EditLinkForm = ({ link, onSuccess }: EditLinkFormProps) => {
  const { notifyLinksChanged } = useLinksSyncActions();
  // The server's note error (over the cap), shown in the Notes field's error
  // slot until the note changes or the form is sent again.
  const [notesError, setNotesError] = React.useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      title: link.title,
      description: link.description ?? "",
      notes: link.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      setNotesError(null);
      try {
        const res = await fetch(`/api/links/${link.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...linksOriginHeaders },
          body: JSON.stringify({
            title: value.title,
            // Persist `null` instead of empty string to match API expectations.
            description: value.description?.trim() ? value.description : null,
            notes: value.notes.trim() ? value.notes : null,
          }),
        });

        if (!res.ok) {
          const body: { error?: string; code?: string } | null = await res
            .json()
            .catch(() => null);
          if (body?.code === "INVALID_NOTES" && body.error) {
            // Shown under the Notes field, not as a toast.
            setNotesError(body.error);
            return;
          }
          toast.error("Unable to save changes. Try again.");
          return;
        }

        toast.success("Link updated");
        notifyLinksChanged();
        onSuccess();
      } catch {
        toast.error("Unable to save changes. Check your connection and try again.");
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
          name="title"
          validators={{
            onSubmit: ({ value }) =>
              !value?.trim() ? "Enter a title." : undefined,
          }}
        >
          {(field) => (
            <Field>
              <Label htmlFor={field.name}>Title</Label>
              <Input
                id={field.name}
                name={field.name}
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                autoComplete="off"
                disabled={form.state.isSubmitting}
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

        <form.Field name="description">
          {(field) => (
            <Field>
              <Label htmlFor={field.name}>Description</Label>
              <Textarea
                id={field.name}
                name={field.name}
                rows={4}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                disabled={form.state.isSubmitting}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => {
            const hintId = `${field.name}-hint`;
            const errorId = `${field.name}-error`;
            const invalid = notesError !== null;
            return (
              <Field>
                <Label htmlFor={field.name}>Notes</Label>
                <Typography id={hintId} size="mini">
                  Only you see these.
                </Typography>
                <Textarea
                  id={field.name}
                  name={field.name}
                  rows={4}
                  // A note can run to 2,000 characters: past this the field
                  // scrolls instead of pushing Save below the screen (the
                  // dialog has no height limit of its own).
                  className="max-h-48"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    setNotesError(null);
                    field.handleChange(e.target.value);
                  }}
                  disabled={form.state.isSubmitting}
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
                />
                {invalid ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {notesError}
                  </p>
                ) : null}
              </Field>
            );
          }}
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
          {form.state.isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
};
