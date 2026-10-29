// `LazyMotion`'s loader for Motion's features (`domMax`, in their own chunk):
// one function, so every `LazyMotion` on the page (the selection bar, the
// media faces, the media viewer) shares the same import.
export const loadMotionFeatures = () =>
  import("@/lib/motion-features").then((mod) => mod.default);
