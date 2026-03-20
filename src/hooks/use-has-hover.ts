"use client";

import * as React from "react";

/** True when the primary input supports hover (e.g. mouse). False on typical touch UIs. */
export function useHasHover(): boolean {
  const [hasHover, setHasHover] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    const sync = () => setHasHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return hasHover;
}
