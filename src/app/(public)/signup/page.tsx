"use client";

import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";

export default function Signup() {
  const { signUpWithEmail } = useAuth();

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await signUpWithEmail({
        name: value.name?.trim() || undefined,
        email: value.email,
        password: value.password,
      });
    },
  });

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <Typography component="h1" className="text-foreground">
                Create an account
              </Typography>
            </CardTitle>
            <CardDescription>
              <Typography size="small" className="text-muted-foreground">
                Enter your email and choose a password. We&apos;ll send a
                verification link to your email.
              </Typography>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Name</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder="Your name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="name"
                    disabled={form.state.isSubmitting}
                  />
                </div>
              )}
            </form.Field>
            <form.Field
              name="email"
              validators={{
                onSubmit: ({ value }) =>
                  !value?.trim() ? "Email is required." : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="email"
                    disabled={form.state.isSubmitting}
                  />
                  {field.state.meta.errors?.length ? (
                    <p className="text-sm text-destructive" role="alert">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <form.Field
              name="password"
              validators={{
                onSubmit: ({ value }) =>
                  !value?.trim()
                    ? "Password is required."
                    : (value as string).length < 8
                      ? "Password must be at least 8 characters."
                      : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="new-password"
                    disabled={form.state.isSubmitting}
                  />
                  {field.state.meta.errors?.length ? (
                    <p className="text-sm text-destructive" role="alert">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <form.Field
              name="confirmPassword"
              validators={{
                onSubmit: ({ value, fieldApi }) => {
                  if (!value?.trim()) return "Confirm password is required.";
                  if (value !== fieldApi.form.getFieldValue("password")) {
                    return "Passwords do not match.";
                  }
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Confirm password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="new-password"
                    disabled={form.state.isSubmitting}
                  />
                  {field.state.meta.errors?.length ? (
                    <p className="text-sm text-destructive" role="alert">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={form.state.isSubmitting}
            >
              {form.state.isSubmitting ? "Creating account…" : "Sign up"}
            </Button>
            <Typography size="small" className="text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary underline-offset-4 hover:underline"
              >
                Log in
              </Link>
            </Typography>
          </CardFooter>
        </Card>
      </div>
    </form>
  );
}
