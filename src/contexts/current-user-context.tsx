"use client";

import type { ProviderId } from "@/lib/auth-providers";
import type { SessionUser } from "@/lib/session";
import {
  createContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type CurrentUserContextValue = {
  user: SessionUser | null;
  /** Patch the user after a profile change (e.g. a new avatar). */
  setUser: Dispatch<SetStateAction<SessionUser | null>>;
  /** Sign-in providers configured for this deployment (Settings → Account). */
  enabledProviders: ProviderId[];
};

export const CurrentUserContext = createContext<CurrentUserContextValue>({
  user: null,
  setUser: () => {},
  enabledProviders: [],
});

/**
 * Provides the signed-in user resolved on the server, so client components
 * don't need a separate `get-session` request after hydration.
 */
export function CurrentUserProvider({
  user: initialUser,
  enabledProviders = [],
  children,
}: {
  user: SessionUser | null;
  enabledProviders?: ProviderId[];
  children: ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  return (
    <CurrentUserContext.Provider value={{ user, setUser, enabledProviders }}>
      {children}
    </CurrentUserContext.Provider>
  );
}
