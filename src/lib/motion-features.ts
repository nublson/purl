// Motion's animation features (`domAnimation`: animate, exit, variants), in
// a chunk of their own: `LazyMotion` fetches it after hydration instead of
// shipping the full `motion` component with every page. The selection bar
// is the only user (link-selection-bar.tsx).
import { domAnimation } from "motion/react";

export default domAnimation;
