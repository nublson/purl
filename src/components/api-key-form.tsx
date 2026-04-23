"use client";

import { deleteApiKey, getApiKeyStatus, saveApiKey } from "@/lib/api-keys";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./ui/input-group";

const ApiKeyForm = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const form = useForm({
    defaultValues: { apiKey: "" },
    onSubmit: async ({ value }) => {
      try {
        await saveApiKey(value.apiKey);
        setHasKey(true);
        form.reset({ apiKey: "" });
        toast.success("API key saved successfully");
      } catch {
        toast.error("Failed to save API key");
      }
    },
  });

  const handleRevoke = async () => {
    try {
      await deleteApiKey();
      setHasKey(false);
      form.reset({ apiKey: "" });
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke API key");
    }
  };

  useEffect(() => {
    getApiKeyStatus().then(({ hasKey }) => setHasKey(hasKey));
  }, []);

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
          name="apiKey"
          validators={{
            onSubmit: ({ value }) =>
              !value?.trim() ? "API key is required." : undefined,
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>OpenAI API Key</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={field.name}
                  name={field.name}
                  value={hasKey ? "sk-this-is-your-api-key" : field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoComplete="off"
                  disabled={form.state.isSubmitting}
                  type="password"
                  placeholder={hasKey ? "Update API key" : "sk-..."}
                  readOnly={hasKey ?? false}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={hasKey ? handleRevoke : form.handleSubmit}
                    variant={hasKey ? "destructive" : "default"}
                    disabled={
                      !hasKey &&
                      (form.state.isSubmitting || !field.state.value?.trim())
                    }
                  >
                    {hasKey ? "Revoke" : "Save"}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <div className="flex items-baseline justify-between gap-1">
                <FieldDescription className="text-xs">
                  Your API key is encrypted and stored securely.
                </FieldDescription>
              </div>
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
    </form>
  );
};

export default ApiKeyForm;
