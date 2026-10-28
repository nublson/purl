"use client";

import { useAudioView } from "@/hooks/use-audio-player";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import { useState } from "react";
import { MusicNote } from "reicon-react";
import { AudioTimes, AudioTrack, AudioTransport, keepAudioClick } from "./audio-bar";
import { AudioRowSecondLine } from "./audio-row";

/**
 * A row's hover preview for an audio pearl: a player card in the preview's
 * width. The hero (the full width, 180px tall) is the pearl's sleeve art
 * (its page's image, `object-cover`; without one, or if it fails, the
 * music icon at 48px on the muted tint), fading into the card over its
 * lower half; over the fade's foot, the title (two lines at most) and the
 * second line (`linkSecondLine`, or "0:22 / 2:36" while the pearl is
 * loaded, as rows read). Under it, 16px in: the track (a scrubber, the
 * bar's), the elapsed and the length, and the transport centred (Restart,
 * Play/Pause, Open file), 16px under it. It doesn't expand.
 *
 * A view of the page's one player, like the row and the card: its Play
 * plays the same `<audio>` they show.
 */
export function AudioPreview({ link }: { link: Link }) {
  useAudioView(link.id);
  return (
    <div data-face="audio-preview" className="flex flex-col">
      <div className="relative h-[180px] w-full shrink-0 overflow-hidden rounded-t-lg">
        <AudioHero link={link} />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-b from-transparent to-card"
        />
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col p-4">
          <p className="line-clamp-2 text-base leading-[22px] font-medium wrap-anywhere text-foreground">
            {link.title}
          </p>
          {/* `text-foreground/70`: the muted pair is under 4.5:1 for small
              text on the faded art. */}
          <p className="truncate text-[13px] leading-[18px] text-foreground/70">
            <AudioRowSecondLine link={link} />
          </p>
        </div>
      </div>
      <div className="flex flex-col p-4">
        {/* A press on the track stays in the preview: never the row's. */}
        <div onClick={keepAudioClick}>
          <AudioTrack link={link} />
        </div>
        <AudioTimes link={link} end="length" className="mt-2 h-[10px]" />
        <AudioTransport link={link} className="mt-4 h-[46px] gap-3.5" />
      </div>
    </div>
  );
}

/** The hero: the sleeve art, else (none, or failed) the music icon on the tint. */
function AudioHero({ link }: { link: Pick<Link, "thumbnail"> }) {
  const src = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src !== null && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF
      <img
        data-hero="image"
        // A server-rendered image can fail before React attaches onError.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
        }}
        src={src}
        alt=""
        decoding="async"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full object-cover"
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return (
    <div
      data-hero="icon"
      className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
    >
      <MusicNote aria-hidden className="size-12" />
    </div>
  );
}
