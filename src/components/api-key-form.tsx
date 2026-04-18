import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./ui/input-group";

const ApiKeyForm = () => {
  const form = useForm({
    defaultValues: {
      apiKey: "",
    },
    onSubmit: async ({ value }) => {
      try {
        console.log(value);

        form.reset();
        toast.success("API key saved successfully");
      } catch {
        toast.error("Failed to save API key");
      }
    },
  });

  return (
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
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoComplete="off"
                  disabled={form.state.isSubmitting}
                  type="password"
                  placeholder="sk-..."
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    disabled={
                      form.state.isSubmitting || !field.state.value?.trim()
                    }
                  >
                    {form.state.isSubmitting ? "Saving…" : "Save"}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Your API key is encrypted and stored securely.
              </FieldDescription>
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
