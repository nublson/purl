import { useSession } from "@/lib/auth-client";
import { DeleteAccountItem } from "./delete-account-item";
import { SettingsItem } from "./settings-item";
import { Typography } from "./typography";

export function SettingsAccount({ closeDialog }: { closeDialog: () => void }) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <SettingsItem
        title="Email"
        description="The email address for your account"
        actions={
          <Typography size="sm" className="font-medium text-muted-foreground">
            {email}
          </Typography>
        }
      />
      <DeleteAccountItem closeDialog={closeDialog} />
    </div>
  );
}
