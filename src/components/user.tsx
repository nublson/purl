"use client";

import { useAuth } from "@/hooks/use-auth";
import { useSession } from "@/lib/auth-client";
import {
  BadgeCheck,
  LogOut,
  MessageCircleHeart,
  SettingsIcon,
} from "lucide-react";
import { FeedbackDialog } from "./dialog-feedback";
import { SettingsDialog } from "./dialog-settings";
import { UpgradeDialog } from "./dialog-upgrade";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { UserItem } from "./user-item";

export function User() {
  const { data: session } = useSession();
  const { signOut } = useAuth();
  const user = session?.user ?? null;

  return (
    <DropdownWrapper
      className="w-52"
      align="end"
      trigger={
        <Button variant="ghost" size="icon-sm" className="rounded-full">
          <Avatar>
            <AvatarImage
              className="rounded-full"
              src={user?.image ?? ""}
              alt={user?.name ?? ""}
            />
            <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
          </Avatar>
        </Button>
      }
    >
      <DropdownMenuGroup>
        <DropdownMenuItem>
          <UserItem
            user={{
              image: user?.image ?? "",
              name: user?.name ?? "",
              email: user?.email ?? "",
            }}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <FeedbackDialog>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            <MessageCircleHeart />
            Share feedback
          </DropdownMenuItem>
        </FeedbackDialog>
        <SettingsDialog>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
        </SettingsDialog>
        <UpgradeDialog>
          <DropdownMenuItem
            disabled
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            <BadgeCheck />
            Upgrade
          </DropdownMenuItem>
        </UpgradeDialog>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={() => signOut()}>
        <LogOut />
        Sign out
      </DropdownMenuItem>
    </DropdownWrapper>
  );
}
