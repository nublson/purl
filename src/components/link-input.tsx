"use client";

import { Field } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { saveLink } from "@/lib/save-link";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

export function LinkInput({
  onSaveStart,
  onSaveSuccess,
  onSaveError,
}: {
  onSaveStart?: (url: string) => void;
  onSaveSuccess?: (id: string) => void;
  onSaveError?: (detail: { limit?: boolean; message?: string } | null) => void;
}) {
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      url: "",
    },
    onSubmit: async ({ value, formApi }) => {
      onSaveStart?.(value.url);
      const result = await saveLink(value.url);
      if (!result || !("id" in result)) {
        onSaveError?.(
          result && "error" in result
            ? { limit: result.limit, message: result.error }
            : null,
        );
        return;
      }

      formApi.reset();
      if (result.id) {
        onSaveSuccess?.(result.id);
      }
      if (!onSaveSuccess) {
        router.refresh();
      }
    },
  });

  return (
    <form
      className="[@media(hover:hover)]:hidden"
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await form.handleSubmit();
      }}
    >
      <form.Field
        name="url"
        validators={{
          onSubmit: ({ value }) =>
            !value?.trim() ? "URL is required." : undefined,
        }}
      >
        {(field) => {
          const isUrlEmpty = !field.state.value.trim();
          return (
            <Field>
              <InputGroup className="h-10">
                <InputGroupInput
                  data-cy="url-input"
                  name={field.name}
                  placeholder="Save a link..."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={form.state.isSubmitting}
                />
                <InputGroupAddon align="inline-end">
                  <Button
                    data-cy="save-link-button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={form.state.isSubmitting || isUrlEmpty}
                  >
                    <Plus />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          );
        }}
      </form.Field>
    </form>
  );
}
