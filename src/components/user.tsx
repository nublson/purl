"use client";

import { useAuth } from "@/hooks/use-auth";
import { useSession } from "@/lib/auth-client";
import {
  BadgeCheck,
  LogOut,
  MessageCircleHeart,
  SettingsIcon,
} from "lucide-react";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
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
        <Avatar>
          <AvatarImage
            className="rounded-full"
            src={user?.image ?? ""}
            alt={user?.name ?? ""}
          />
          <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      }
    >
      <DropdownMenuGroup>
        <DropdownMenuItem disabled>
          <MessageCircleHeart />
          Share feedback
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
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
