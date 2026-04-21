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
import { DropdownWrapper } from "./dropdown-wrapper";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function User() {
  const { data: session } = useSession();
  const { signOut } = useAuth();
  const user = session?.user ?? null;

  return (
    <DropdownWrapper
      className="w-44"
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
        <DropdownMenuItem disabled>
          <BadgeCheck />
          Upgrade
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={() => signOut()}>
        <LogOut />
        Sign out
      </DropdownMenuItem>
    </DropdownWrapper>
  );
}
