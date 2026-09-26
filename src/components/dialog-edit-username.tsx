"use client";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { validateUsername } from "@/lib/usernames";
import * as React from "react";
import { toast } from "sonner";
import { DialogWrapper } from "./dialog-wrapper";

const FORMAT_MESSAGE = "Use 3–30 lowercase letters, numbers, - or _";
const RESERVED_MESSAGE = "That username is reserved";
const TAKEN_MESSAGE = "That username is taken";
const AVAILABILITY_DEBOUNCE_MS = 300;

const AVAILABILITY_CHECK_ERROR_MESSAGE = "Couldn't check availability. Try again.";

type FieldStatus =
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string }
  | { kind: "checking" }
  | { kind: "taken" }
  | { kind: "available" }
  | { kind: "check-error" };

interface DialogEditUsernameProps {
  children: React.ReactNode;
}

export function DialogEditUsername({ children }: DialogEditUsernameProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      title="Edit username"
      open={open}
      onOpenChange={setOpen}
      content={<EditUsernameForm onSuccess={() => setOpen(false)} />}
    >
      {children}
    </DialogWrapper>
  );
}

function EditUsernameForm({ onSuccess }: { onSuccess: () => void }) {
  const { user, setUser } = useCurrentUser();
  const currentUsername = user?.username ?? "";
  const [value, setValue] = React.useState(currentUsername);
  const [status, setStatus] = React.useState<FieldStatus>({ kind: "unchanged" });
  const [saving, setSaving] = React.useState(false);

  // Validate on every keystroke; after a 300ms pause, check availability for
  // a value that's valid and different from the current username. The
  // AbortController cancels the in-flight request (and the cleanup clears a
  // not-yet-fired timer) whenever `value` changes again, so a stale response
  // never overwrites the status for newer input.
  React.useEffect(() => {
    const check = validateUsername(value);
    if (!check.ok) {
      setStatus({
        kind: "invalid",
        message: check.reason === "format" ? FORMAT_MESSAGE : RESERVED_MESSAGE,
      });
      return;
    }
    if (check.username === currentUsername) {
      setStatus({ kind: "unchanged" });
      return;
    }

    setStatus({ kind: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/user/username/available?u=${encodeURIComponent(check.username)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            // A non-OK response (401/429/500/…) has no `available` field —
            // treating it as unavailable would show "taken" for a value
            // that was never actually checked, so surface a neutral error
            // and keep Save disabled instead.
            setStatus({ kind: "check-error" });
            return;
          }
          const data = (await res.json()) as { available: boolean };
          setStatus(data.available ? { kind: "available" } : { kind: "taken" });
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            // Newer input arrived; the effect that scheduled this request
            // has already been cleaned up, so just let it drop.
            return;
          }
          setStatus({ kind: "check-error" });
        });
    }, AVAILABILITY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, currentUsername]);

  const message =
    status.kind === "invalid"
      ? status.message
      : status.kind === "taken"
        ? TAKEN_MESSAGE
        : status.kind === "checking"
          ? "Checking availability…"
          : status.kind === "available"
            ? "Username is available"
            : status.kind === "check-error"
              ? AVAILABILITY_CHECK_ERROR_MESSAGE
              : null;

  const canSave = status.kind === "available" && !saving;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (status.kind !== "available") return;

    setSaving(true);
    try {
      const res = await fetch("/api/user/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const body = (await res.json().catch(() => null)) as
        | { username?: string; error?: string; code?: string }
        | null;

      if (!res.ok) {
        if (res.status === 409 || body?.code === "TAKEN") {
          setStatus({ kind: "taken" });
        } else {
          toast.error(body?.error ?? "Unable to update your username. Try again.");
        }
        return;
      }

      const username = body?.username ?? value;
      setUser((u) => (u ? { ...u, username } : u));
      await getSession({ query: { disableCookieCache: true } });
      toast.success("Username updated");
      onSuccess();
    } catch {
      toast.error("Unable to update your username. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-6 px-6 pt-6" onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            disabled={saving}
            aria-invalid={
              status.kind === "invalid" || status.kind === "taken" ? true : undefined
            }
            aria-describedby={message ? "username-message" : undefined}
          />
          {/* Always mounted (visually hidden while empty) so screen readers
              reliably announce status changes through the live region. */}
          <p
            id="username-message"
            role="status"
            aria-live="polite"
            className={cn(
              "text-sm",
              !message && "sr-only",
              status.kind === "available" || status.kind === "checking"
                ? "text-muted-foreground"
                : "text-destructive",
            )}
          >
            {message}
          </p>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={saving}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!canSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
