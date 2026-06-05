"use client";

import { Typography } from "@/components/typography";
import { useEffect, useState } from "react";

export function RateLimitCountdown({
  untilMs,
  onExpire,
}: {
  untilMs: number;
  onExpire?: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => {
      const s = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s === 0) onExpire?.();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [untilMs, onExpire]);

  return (
    <Typography size="small" className="text-muted-foreground">
      Too many requests. Retry in {secondsLeft}s
    </Typography>
  );
}
