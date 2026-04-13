"use client";

import { deleteUser } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DialogWrapper } from "./dialog-wrapper";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "./ui/item";
import { Input } from "./ui/input";

interface SettingsDialogProps {
  children: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      open={open}
      onOpenChange={setOpen}
      title="Settings"
      description="Manage your settings"
      content={<SettingsContent onAccountDeleted={() => setOpen(false)} />}
    >
      {children}
    </DialogWrapper>
  );
}

interface SettingsContentProps {
  onAccountDeleted: () => void;
}

function SettingsContent({ onAccountDeleted }: SettingsContentProps) {
  return (
    <ItemGroup className="w-full">
      <Item className="px-0">
        <ItemContent>
          <ItemTitle>Delete account</ItemTitle>
          <ItemDescription>
            Delete your account and all your data.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <DeleteAccountButton onAccountDeleted={onAccountDeleted} />
        </ItemActions>
      </Item>
    </ItemGroup>
  );
}

function DeleteAccountButton({
  onAccountDeleted,
}: {
  onAccountDeleted: () => void;
}) {
  const router = useRouter();
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleAlertOpenChange = (next: boolean) => {
    if (isDeleting) return;
    setAlertOpen(next);
    if (!next) setPassword("");
  };

  const handleDelete = async () => {
    const trimmed = password.trim();
    if (!trimmed) {
      toast.error("Enter your password to confirm.");
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteUser({
        password: trimmed,
        callbackURL: "/login",
      });

      if (res.error) {
        toast.error(res.error.message ?? "Could not delete account.");
        return;
      }

      toast.success("Your account has been deleted.");
      setAlertOpen(false);
      setPassword("");
      onAccountDeleted();
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not delete account.");
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
      <AlertDialogContent size="default" className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your saved links, chats, and profile. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="delete-account-password">
              Confirm with your password
            </FieldLabel>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDeleting}
            />
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
