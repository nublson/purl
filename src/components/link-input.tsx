"use client";

import { Field } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { focusFirstInvalid } from "@/lib/focus-first-invalid";
import { saveLink } from "@/lib/save-link";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { useId } from "react";
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
  const { notifyLinksChanged } = useLinksSyncActions();
  const errorId = useId();
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
        notifyLinksChanged();
      }
    },
  });

  return (
    <form
      className="[@media(hover:hover)]:hidden"
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const formElement = event.currentTarget;
        await form.handleSubmit();
        focusFirstInvalid(formElement);
      }}
    >
      <form.Field
        name="url"
        validators={{
          onSubmit: ({ value }) =>
            !value?.trim() ? "Enter a URL to save." : undefined,
        }}
      >
        {(field) => {
          const hasError = Boolean(field.state.meta.errors?.length);
          return (
            <Field>
              <InputGroup className="h-10">
                <InputGroupInput
                  data-cy="url-input"
                  name={field.name}
                  aria-label="Link to save"
                  placeholder="Save a link…"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={form.state.isSubmitting}
                  aria-invalid={hasError || undefined}
                  aria-describedby={hasError ? errorId : undefined}
                />
                <InputGroupAddon align="inline-end">
                  <Button
                    data-cy="save-link-button"
                    type="submit"
                    aria-label="Save link"
                    variant="ghost"
                    size="icon-sm"
                    disabled={form.state.isSubmitting}
                  >
                    <Plus />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
              {hasError ? (
                <p id={errorId} className="text-sm text-destructive">
                  {field.state.meta.errors.join(", ")}
                </p>
              ) : null}
            </Field>
          );
        }}
      </form.Field>
    </form>
  );
}
