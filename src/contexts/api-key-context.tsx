"use client";

import { createContext, useContext } from "react";

const ApiKeyContext = createContext<boolean>(false);

export function ApiKeyProvider({
  hasApiKey,
  children,
}: {
  hasApiKey: boolean;
  children: React.ReactNode;
}) {
  return (
    <ApiKeyContext.Provider value={hasApiKey}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useHasApiKey(): boolean {
  return useContext(ApiKeyContext);
}
