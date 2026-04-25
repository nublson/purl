"use client";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Link as LinkType } from "@/utils/links";
import { useForm } from "@tanstack/react-form";
import * as React from "react";
import { toast } from "sonner";
import { DialogWrapper } from "./dialog-wrapper";

interface EditDialogProps {
  link: LinkType;
  children: React.ReactNode;
}

export function EditDialog({ link, children }: EditDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Edit link"
      description="Update the title and description for this link."
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
  const form = useForm({
    defaultValues: {
      title: link.title,
      description: link.description ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        const res = await fetch(`/api/links/${link.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: value.title,
            // Persist `null` instead of empty string to match API expectations.
            description: value.description?.trim() ? value.description : null,
          }),
        });

        if (!res.ok) {
          toast.error("Failed to update link");
          return;
        }

        toast.success("Link updated");
        onSuccess();
      } catch {
        toast.error("Failed to update link");
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
          name="title"
          validators={{
            onSubmit: ({ value }) =>
              !value?.trim() ? "Title is required." : undefined,
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
