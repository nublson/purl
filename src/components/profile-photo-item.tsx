"use client";

import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AVATAR_MAX_UPLOAD_BYTES } from "@/utils/upload-limits";
import { SettingsItem } from "./settings-item";
import { Button } from "./ui/button";

/** Keyboard-reachable profile photo upload (the account menu avatar is a mouse shortcut). */
export function ProfilePhotoItem() {
  const { user } = useCurrentUser();
  const { inputRef, isUploading, onFileChange, openPicker } = useAvatarUpload();

  return (
    <SettingsItem
      title="Profile photo"
      description={`An image under ${AVATAR_MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`}
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
          <Button
            variant="secondary"
            size="sm"
            className="cursor-pointer"
            disabled={isUploading}
            onClick={openPicker}
          >
            {isUploading
              ? "Uploading…"
              : user?.image
                ? "Change photo"
                : "Upload photo"}
          </Button>
        </>
      }
    />
  );
}
