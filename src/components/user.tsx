"use client";

import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ChatRoundLike, Logout4, Setting2 } from "reicon-react";
import * as React from "react";
import {
  SettingsDeepLink,
  SettingsDialog,
  type SettingsTabValue,
} from "./dialog-settings";
import { FeedbackDialog } from "./dialog-feedback";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { UserItem } from "./user-item";
import { FolderTagsMenuItem, ViewModeMenu } from "./view-mode-menu";

export function User() {
  const { user } = useCurrentUser();
  const { signOut } = useAuth();

  // Owned here, not inside SettingsDialog/its dropdown trigger: Radix only
  // mounts the dropdown's menu content once it's been opened, so a
  // ?settings= deep link arriving on page load needs SettingsDeepLink
  // mounted unconditionally, with the dialog it drives controlled from here.
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = React.useState<
    SettingsTabValue | undefined
  >(undefined);
  // Set when the "Settings" menu item is chosen; the dialog is opened from
  // the menu's onCloseAutoFocus, i.e. after the menu has unmounted and
  // returned focus to the avatar trigger. That way the dialog captures the
  // trigger (not a menu item that's about to disappear) as the element to
  // restore focus to when it closes.
  const openSettingsAfterMenuClose = React.useRef(false);

  return (
    <>
      <React.Suspense fallback={null}>
        <SettingsDeepLink
          onOpen={(tab) => {
            setSettingsDefaultTab(tab);
            setSettingsOpen(true);
          }}
        />
      </React.Suspense>
      {/*
        Rendered outside the dropdown: Radix only mounts menu content while
        the menu is open, so a dialog living in there couldn't be opened by
        the deep link above.
      */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          // Reset so a later manual open lands on the first tab instead
          // of whatever a past deep link set.
          if (!open) setSettingsDefaultTab(undefined);
        }}
        defaultTab={settingsDefaultTab}
      />
      <DropdownWrapper
        className="w-52"
        align="end"
        onCloseAutoFocus={() => {
          if (!openSettingsAfterMenuClose.current) return;
          openSettingsAfterMenuClose.current = false;
          setSettingsOpen(true);
        }}
        trigger={
          <Button
            data-cy="user-menu-button"
            aria-label="Account menu"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
          >
            <Avatar>
              <AvatarImage
                className="rounded-full"
                src={user?.image ?? ""}
                alt=""
              />
              <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
          </Button>
        }
      >
        <DropdownMenuGroup>
          <UserItem
            user={{
              image: user?.image ?? "",
              name: user?.name ?? "",
              email: user?.email ?? "",
            }}
          />
          <DropdownMenuSeparator />
        </DropdownMenuGroup>
        {/* Layout: how the lists look (its own group, apart from the
            account's actions below). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Layout
          </DropdownMenuLabel>
          <ViewModeMenu />
          <FolderTagsMenuItem />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <FeedbackDialog>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              <ChatRoundLike />
              Share feedback
            </DropdownMenuItem>
          </FeedbackDialog>
          <DropdownMenuItem
            onSelect={() => {
              // Let the menu close normally; onCloseAutoFocus above opens
              // the dialog once it has.
              openSettingsAfterMenuClose.current = true;
            }}
          >
            <Setting2 />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-cy="sign-out-menu-item"
          onClick={() => signOut()}
        >
          <Logout4 />
          Log out
        </DropdownMenuItem>
      </DropdownWrapper>
    </>
  );
}
