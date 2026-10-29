import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

/** Each bar's rest height, low point, period and offset (see `eq-bar` in globals.css). */
const BARS = [
  { rest: 0.55, low: 0.3, ms: 900, delay: -200 },
  { rest: 0.95, low: 0.45, ms: 700, delay: -500 },
  { rest: 0.7, low: 0.25, ms: 1100, delay: -100 },
] as const;

/**
 * Three bars that bob while a pearl plays: what marks the playing audio in
 * a list row's icon slot and in its card's corner. Decorative
 * (`aria-hidden`): the Play/Pause button's name says it's playing. In
 * `currentColor`, filling its box; still (at their rest heights) under
 * reduced motion.
 */
export function EqualizerBars({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-eq=""
      className={cn("flex items-end justify-center gap-[15%] px-[10%] py-[12%]", className)}
    >
      {BARS.map((bar) => (
        <span
          key={bar.ms}
          data-eq-bar=""
          className="h-full w-[22%] rounded-[1px] bg-current"
          style={
            {
              "--eq-rest": bar.rest,
              "--eq-low": bar.low,
              "--eq-ms": `${bar.ms}ms`,
              "--eq-delay": `${bar.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
