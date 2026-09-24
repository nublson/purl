import {
  LinksSyncActionsContext,
  LinksSyncStateContext,
} from "@/contexts/links-sync-context";
import { useContext } from "react";

/** Stable actions for signalling link changes; never causes re-renders. */
export function useLinksSyncActions() {
  return useContext(LinksSyncActionsContext);
}

/** Change counter and latest saved-link total; re-renders when either changes. */
export function useLinksSyncState() {
  return useContext(LinksSyncStateContext);
}
