import { Book3, BookOpen } from "reicon-react";

/**
 * The icon for toggling a link's reading state, given what it is now:
 * an open book to mark it read (opened), a closed book to mark it unread
 * (not opened yet). Books, not checkmarks: in the list a check already
 * means "selected". Used by the row menu and the selection bar, so they
 * always agree.
 */
export function ReadToggleIcon({ read }: { read: boolean }) {
  return read ? <Book3 /> : <BookOpen />;
}
