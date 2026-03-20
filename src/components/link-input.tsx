"use client";

import { Field } from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { saveLink } from "@/lib/save-link";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";

export function LinkInput() {
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      url: "",
    },
    onSubmit: async ({ value, formApi }) => {
      const result = await saveLink(value.url);
      if (!result) {
        return;
      }

      formApi.reset();
      router.refresh();
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
                  name={field.name}
                  placeholder="Save a link..."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={form.state.isSubmitting}
                />
              </InputGroup>
            </Field>
          );
        }}
      </form.Field>
    </form>
  );
}
