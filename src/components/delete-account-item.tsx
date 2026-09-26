import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
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
  const { signOut } = useAuth();
  const { user } = useCurrentUser();
  const username = user?.username ?? "";
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);
  const confirmationRef = React.useRef<HTMLInputElement>(null);

  // Usernames are stored lowercase, so the comparison is case-sensitive
  // against the stored (lowercase) username.
  const normalizedConfirmation = confirmation.trim().replace(/^@/, "");
  const isMatch =
    normalizedConfirmation.length > 0 && normalizedConfirmation === username;

  const handleAlertOpenChange = (next: boolean) => {
    if (isDeleting) return;
    setAlertOpen(next);
    if (!next) {
      setConfirmation("");
    }
  };

  const handleDelete = async () => {
    if (!isMatch) {
      confirmationRef.current?.focus();
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteUser({ callbackURL: "/" });

      if (res.error) {
        if (res.error.code === "SESSION_EXPIRED") {
          toast.error("For your security, sign in again to delete your account.");
          setAlertOpen(false);
          setConfirmation("");
          closeDialog();
          await signOut();
          return;
        }

        toast.error(res.error.message ?? "Unable to delete your account. Try again.");
        return;
      }

      toast.success("Your account has been deleted.");
      setAlertOpen(false);
      setConfirmation("");
      closeDialog();
      router.push("/");
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
            <FieldLabel htmlFor="delete-account-confirmation">
              Type <strong>@{username}</strong> to confirm
            </FieldLabel>
            <Input
              ref={confirmationRef}
              id="delete-account-confirmation"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={isDeleting}
            />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting || !isMatch}
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
