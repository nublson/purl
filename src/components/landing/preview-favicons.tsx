/**
 * Inline marks for the product panel's rows: simple shapes and letters, no
 * network requests, no logos reproduced in detail. Each fills the row's
 * favicon box (20px, 24px on phones); the rows size them.
 */

const BASE = "size-full";

/** paulgraham.com: an orange tile with a "pg" monogram. */
export function PaulGrahamMark() {
  return (
    <svg viewBox="0 0 20 20" className={BASE} aria-hidden="true">
      <rect width="20" height="20" rx="3" fill="#ff6600" />
      <text
        x="10"
        y="14.2"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="11"
        fontWeight="700"
        fill="#fff"
      >
        pg
      </text>
    </svg>
  );
}

/** youtube.com: a red rounded rectangle with a play triangle. */
export function VideoMark() {
  return (
    <svg viewBox="0 0 20 20" className={BASE} aria-hidden="true">
      <rect x="1" y="4" width="18" height="12" rx="3.5" fill="#ff0033" />
      <path d="M8.2 7.4v5.2L12.8 10z" fill="#fff" />
    </svg>
  );
}

/** nytimes.com: a black tile with a serif "T". */
export function NewspaperMark() {
  return (
    <svg viewBox="0 0 20 20" className={BASE} aria-hidden="true">
      <rect width="20" height="20" rx="3" fill="#111" />
      <text
        x="10"
        y="15"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="14"
        fontWeight="700"
        fill="#fff"
      >
        T
      </text>
    </svg>
  );
}

/** arxiv.org (a PDF): the app's document glyph, drawn inline. */
export function PdfMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${BASE} text-muted-foreground`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** The header's globe (the Public button). */
export function GlobeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.25" />
      <path d="M2.75 12h18.5M12 2.75c2.6 2.6 3.9 5.7 3.9 9.25s-1.3 6.65-3.9 9.25c-2.6-2.6-3.9-5.7-3.9-9.25S9.4 5.35 12 2.75z" />
    </svg>
  );
}

/** The folder switcher's chevron. */
export function ChevronMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
