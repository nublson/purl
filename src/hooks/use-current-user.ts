import { CurrentUserContext } from "@/contexts/current-user-context";
import { useContext } from "react";

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
