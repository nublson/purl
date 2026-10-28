/* Adapted from Bencho's "Now playing" (bencho.dev, MIT licence): the
   play/pause mark's geometry, kept pure so the paths can be tested. */

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* in AND out, for the one thing here that is a round trip between two
   shapes rather than an arrival at one */
export const SWING = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/* ── the play mark is DRAWN, not swapped ───────────────────
   Two icons exchanged is a cut, however short you make the
   crossfade, and a transport button is the one control here
   you press more than once — a cut you see forty times is the
   thing you end up looking at.

   So both marks are the SAME two quadrilaterals, and the
   difference between them is where eight points are. The
   pause is a pair of bars; the play is that pair with the
   inner edges pulled to the middle and collapsed to a point,
   which is a triangle split down its own axis. Nothing
   appears and nothing leaves — the shapes are continuous the
   whole way, so there is no frame where the button is
   ambiguous about what it does.

   The points are lucide's own, so it sits at the same weight
   as the skip glyphs beside it: bars at x 6..10 and 14..18,
   a triangle from 6.5 to 20, stroked 2 with a round join,
   which is where the softened corners come from.

   Wound the same way in both — top-left, top-right,
   bottom-right, bottom-left — or the halves would turn
   inside out on the way across. The play's right half is a
   triangle written as a quad with its two right points on
   top of each other. */
export const PAUSE_L = [6, 4, 10, 4, 10, 20, 6, 20] as const;
export const PLAY_L = [6.5, 4, 13.25, 8, 13.25, 16, 6.5, 20] as const;
export const PAUSE_R = [14, 4, 18, 4, 18, 20, 14, 20] as const;
export const PLAY_R = [13.25, 8, 20, 12, 20, 12, 13.25, 16] as const;

const quad = (a: readonly number[], b: readonly number[], t: number) => {
  let d = "";
  for (let i = 0; i < 8; i += 2)
    d += `${i ? "L" : "M"}${mix(a[i], b[i], t).toFixed(2)} ${mix(
      a[i + 1],
      b[i + 1],
      t,
    ).toFixed(2)}`;
  return `${d}Z`;
};

/** The two halves' path data; `t` 0 is the pause, 1 is the play. */
export function markPaths(t: number): { left: string; right: string } {
  return {
    left: quad(PAUSE_L, PLAY_L, t),
    right: quad(PAUSE_R, PLAY_R, t),
  };
}
