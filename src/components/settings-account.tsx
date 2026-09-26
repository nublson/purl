import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DialogEditUsername } from "./dialog-edit-username";
import { DeleteAccountItem } from "./delete-account-item";
import { ProfilePhotoItem } from "./profile-photo-item";
import { SettingsItem } from "./settings-item";
import { SettingsSignInMethods } from "./settings-sign-in-methods";
import { Button } from "./ui/button";

export function SettingsAccount({ closeDialog }: { closeDialog: () => void }) {
  const { signOut } = useAuth();
  const { user, enabledProviders } = useCurrentUser();
  const username = user?.username ?? null;
  const email = user?.email ?? null;

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <SettingsItem
        title="Username"
        description={username ? `@${username}` : ""}
        fullDescription
        actions={
          <DialogEditUsername>
            <Button variant={"secondary"} size={"sm"} className="cursor-pointer">
              Edit
            </Button>
          </DialogEditUsername>
        }
      />
      <SettingsItem
        title={email ?? "Email"}
        description="From your sign-in provider"
        fullDescription
        actions={null}
      />
      <SettingsSignInMethods providers={enabledProviders} />
      <ProfilePhotoItem />
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
            Log out
          </Button>
        }
      />
      <DeleteAccountItem closeDialog={closeDialog} />
    </div>
  );
}
