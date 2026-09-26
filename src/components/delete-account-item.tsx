import { deleteUser } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { SettingsItem } from "./settings-item";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function DeleteAccountItem({
  closeDialog,
}: {
  closeDialog: () => void;
}) {
  return (
    <SettingsItem
      title="Delete account"
      description="Permanently delete your account and saved links."
      actions={<DeleteAccountButton closeDialog={closeDialog} />}
    />
  );
}

function DeleteAccountButton({ closeDialog }: { closeDialog: () => void }) {
  const router = useRouter();
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const handleAlertOpenChange = (next: boolean) => {
    if (isDeleting) return;
    setAlertOpen(next);
    if (!next) {
      setPassword("");
      setPasswordError(null);
    }
  };

  const handleDelete = async () => {
    const trimmed = password.trim();
    if (!trimmed) {
      setPasswordError("Enter your password to confirm.");
      passwordRef.current?.focus();
      return;
    }
    setPasswordError(null);

    setIsDeleting(true);
    try {
      const res = await deleteUser({
        password: trimmed,
        callbackURL: "/login",
      });

      if (res.error) {
        toast.error(res.error.message ?? "Unable to delete your account. Check your password and try again.");
        return;
      }

      toast.success("Your account has been deleted.");
      setAlertOpen(false);
      setPassword("");
      closeDialog();
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Unable to delete your account. Check your connection and try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={alertOpen} onOpenChange={handleAlertOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="cursor-pointer">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent nested size="default" className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your saved links and profile. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="delete-account-password">
              Confirm with your password
            </FieldLabel>
            <Input
              ref={passwordRef}
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDeleting}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError ? "delete-account-password-error" : undefined
              }
            />
            {passwordError ? (
              <p
                id="delete-account-password-error"
                className="text-sm text-destructive"
              >
                {passwordError}
              </p>
            ) : null}
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            className="cursor-pointer"
            onClick={handleDelete}
          >
            {isDeleting ? "Deleting…" : "Delete account"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
