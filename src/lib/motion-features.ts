// Motion's features for `LazyMotion` (`domMax`: animate, exit, variants,
// plus layout animations, which the media viewer's morph needs), in a chunk
// of their own: `LazyMotion` fetches it after hydration instead of shipping
// the full `motion` component with every page. The selection bar
// (link-selection-bar.tsx) and the media faces load it through
// `loadMotionFeatures` (motion-features-loader.ts); the media viewer's
// slides import it (media-viewer-nav.tsx: the viewer is a chunk of its own,
// and its contents need Motion in the render the Popup mounts in).
import { domMax } from "motion/react";

export default domMax;
