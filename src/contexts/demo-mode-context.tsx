"use client";

import { createContext, useContext } from "react";

type DemoModeValue = {
  /** Switches the demo's current folder (the demo has no routes). */
  selectFolder: (folderId: string) => void;
};

export const DemoModeContext = createContext<DemoModeValue | null>(null);

/** True inside the landing page's demo, where the app's components run on local demo data. */
export function useIsDemo(): boolean {
  return useContext(DemoModeContext) !== null;
}

/** The demo's folder switcher, or null outside the demo. */
export function useDemoFolderSelect(): ((folderId: string) => void) | null {
  return useContext(DemoModeContext)?.selectFolder ?? null;
}
