/**
 * A save in flight, as the page shows it: the URL on its placeholder row,
 * and for a multi-link paste where it stands ("2/8"), so the batch has one
 * indicator that stays until its last link is in.
 */
export type PendingSave = {
  url: string;
  progress?: { index: number; total: number };
};
