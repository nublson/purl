import { Memo } from "reicon-react";

/**
 * Says a link has a private note: on the owner's rows and page cards only
 * (never on the shared folder page). The note itself is in the hover preview.
 */
export function NoteMark() {
  return (
    <span role="img" aria-label="Has a note" className="shrink-0 text-muted-foreground">
      <Memo className="size-3.5" aria-hidden />
    </span>
  );
}
