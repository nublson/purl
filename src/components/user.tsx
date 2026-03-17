"use client";

import { useAuth } from "@/hooks/use-auth";
import { useSession } from "@/lib/auth-client";
import {
  BadgeCheck,
  LogOut,
  MessageCircleHeart,
  SettingsIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function User() {
  const { data: session } = useSession();
  const { signOut } = useAuth();
  const user = session?.user ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer" asChild>
        <Avatar>
          <AvatarImage
            className="rounded-full"
            src={user?.image ?? ""}
            alt={user?.name ?? ""}
          />
          <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44" align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <MessageCircleHeart />
            Share feedback
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem>
            <BadgeCheck />
            Upgrade
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
