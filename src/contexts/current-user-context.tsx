"use client";

import type { SessionUser } from "@/lib/session";
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type CurrentUserContextValue = {
  user: SessionUser | null;
  /** Patch the user after a profile change (e.g. a new avatar). */
  setUser: Dispatch<SetStateAction<SessionUser | null>>;
};

const CurrentUserContext = createContext<CurrentUserContextValue>({
  user: null,
  setUser: () => {},
});

/**
 * Provides the signed-in user resolved on the server, so client components
 * don't need a separate `get-session` request after hydration.
 */
export function CurrentUserProvider({
  user: initialUser,
  children,
}: {
  user: SessionUser | null;
  children: ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  return (
    <CurrentUserContext.Provider value={{ user, setUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
