import { Book, BookOpenCheck } from "lucide-react";

/**
 * The icon for toggling a link's reading state, given what it is now:
 * an open book with a check to mark it read (opened, done), a closed
 * book to mark it unread (not opened yet). Books, not checkmarks: in the
 * list a check already means "selected". Used by the row menu, the
 * selection bar and the row swipe, so they always agree.
 */
export function ReadToggleIcon({ read }: { read: boolean }) {
  return read ? <Book /> : <BookOpenCheck />;
}
