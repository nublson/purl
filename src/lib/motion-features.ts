// Motion's features for `LazyMotion` (`domMax`: animate, exit, variants,
// plus layout animations, which the media viewer's morph needs), in a chunk
// of their own: `LazyMotion` fetches it after hydration instead of shipping
// the full `motion` component with every page. The selection bar
// (link-selection-bar.tsx) is the current user.
import { domMax } from "motion/react";

export default domMax;
