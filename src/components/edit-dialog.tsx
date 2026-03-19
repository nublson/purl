"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Link as LinkType } from "@/utils/links";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

export function EditDialog({
  link,
  children,
}: {
  link: LinkType;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

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
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Failed to update link");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>
            Update the title and description for this link.
          </DialogDescription>
        </DialogHeader>
        <form
          className=" flex flex-col gap-6"
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
      </DialogContent>
    </Dialog>
  );
}
