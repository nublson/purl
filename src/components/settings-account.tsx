import { useAuth } from "@/hooks/use-auth";
import { useSession } from "@/lib/auth-client";
import { DeleteAccountItem } from "./delete-account-item";
import { SettingsItem } from "./settings-item";
import { Typography } from "./typography";
import { Button } from "./ui/button";

export function SettingsAccount({ closeDialog }: { closeDialog: () => void }) {
  const { signOut } = useAuth();
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <SettingsItem
        title="Email"
        description="The email address for your account"
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
        title="Sign out"
        description="Sign out of your account"
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
