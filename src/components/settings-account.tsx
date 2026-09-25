import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DeleteAccountItem } from "./delete-account-item";
import { SettingsItem } from "./settings-item";
import { Typography } from "./typography";
import { Button } from "./ui/button";

export function SettingsAccount({ closeDialog }: { closeDialog: () => void }) {
  const { signOut } = useAuth();
  const { user } = useCurrentUser();
  const email = user?.email ?? null;

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <SettingsItem
        title="Email"
        description="The email you log in with"
        actions={
          <Typography
            size="small"
            className="font-medium text-muted-foreground"
          >
            {email}
          </Typography>
        }
      />
      <SettingsItem
        title="Log out"
        description="Log out of Purl on this device"
        actions={
          <Button
            variant={"secondary"}
            size={"sm"}
            className="cursor-pointer"
            onClick={() => signOut()}
          >
            Sign out
          </Button>
        }
      />
      <DeleteAccountItem closeDialog={closeDialog} />
    </div>
  );
}
