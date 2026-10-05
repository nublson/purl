"use client";

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";

/**
 * The folder dialog's emoji picker (Frimousse): search, the grid and the
 * skin-tone footer. Its own module so it loads only once a folder dialog
 * opens, not with every page (see `DialogFolderForm`).
 */
export default function FolderEmojiPickerPanel({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <EmojiPicker className="h-80" onEmojiSelect={({ emoji }) => onSelect(emoji)}>
      <EmojiPickerSearch />
      <EmojiPickerContent />
      <EmojiPickerFooter />
    </EmojiPicker>
  );
}
