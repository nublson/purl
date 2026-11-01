"use client";

import { useState } from "react";

/** An article image; a failed one shows its alt text in place. */
export function ReaderImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return alt ? <span className="text-muted-foreground">{alt}</span> : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="my-6 h-auto max-w-full rounded-lg outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
    />
  );
}
