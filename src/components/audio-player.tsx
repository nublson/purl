"use client";

import { useAudioPlayer, useAudioView } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import type { Link } from "@/utils/links";
import {
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Export5, MusicNote, Restart } from "reicon-react";
import { AudioRowSecondLine } from "./audio-row";
import { PlayMark } from "./play-mark";

/**
 * A click inside the player's controls never reaches its host (a click on
 * the owner's card selects it while selecting; a hover preview sits in its
 * row). Only clicks on the controls themselves: React bubbles a portal's
 * events through here too.
 */
export function keepAudioClick(event: MouseEvent<HTMLElement>) {
  if (!event.currentTarget.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
}

/** The fade into each surface the player sits on (literal, for Tailwind). */
const FADE = {
  card: "via-card/90 to-card",
  popover: "via-popover/90 to-popover",
} as const;

/**
 * An audio pearl's player card: its grid card (the owner's, the shared
 * folder's, the demo's) and a list row's hover preview. The hero (the full
 * width, 180px tall) is the pearl's sleeve art (its page's image,
 * `object-cover`; without one, or if it fails, the music icon at 48px on
 * the muted tint), fading into the surface under it so the words sit on a
 * near-solid foot; over it, the title (two lines at most) and the second
 * line (`linkSecondLine`, or "0:22 / 2:36" while the pearl is loaded, as
 * rows read). Under it, 16px in: the track (a scrubber), the elapsed and
 * the length, and the transport centred (Restart, Play/Pause, Open file),
 * 16px under it.
 *
 * A view of the page's one player: every view of a pearl (its card, its
 * row, its preview) shows and drives the same `<audio>`. The controls are
 * `data-card-menu`, so a press on them isn't the owner's card's
 * long-press; `inert` (while selecting) steps them aside.
 */
export function AudioPlayer({
  link,
  surface,
  badge,
  inert = false,
  playRef,
}: {
  link: Link;
  /** What it sits on: the hero fades into it. */
  surface: keyof typeof FADE;
  /** The owner's folder badge, in the hero's top-left corner. */
  badge?: ReactNode;
  /** While selecting: the controls step aside. */
  inert?: boolean;
  /** The Play button (the owner's card's focus anchor). */
  playRef?: Ref<HTMLButtonElement>;
}) {
  useAudioView(link.id);
  return (
    <div data-face="audio" className="flex flex-col">
      <div className="relative h-[180px] w-full shrink-0 overflow-hidden rounded-t-lg">
        <AudioHero link={link} />
        {/* The fade: over the hero's lower 120px, already 90% surface by
            the top of a two-line title (35%, 102px down) and solid at the
            foot, so the words read at 4.5:1 or more over any art. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-[120px] bg-linear-to-b from-transparent via-35%",
            FADE[surface],
          )}
        />
        {badge ? (
          // The badge hangs 4px off its box's bottom-end corner.
          <span className="pointer-events-none absolute top-3 left-3 size-1">{badge}</span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col p-4">
          <p className="line-clamp-2 text-base leading-[22px] font-medium wrap-anywhere text-foreground">
            {link.title}
          </p>
          {/* `text-foreground/70`: the muted pair is under 4.5:1 for small
              text. */}
          <p className="truncate text-[13px] leading-[18px] text-foreground/70">
            <AudioRowSecondLine link={link} />
          </p>
        </div>
      </div>
      <div
        data-card-menu
        inert={inert}
        className={cn("flex flex-col p-4", inert ? "pointer-events-none" : "pointer-events-auto")}
      >
        {/* A press on the track stays in the player: never its host's. */}
        <div onClick={keepAudioClick}>
          <AudioTrack link={link} />
        </div>
        <AudioTimes link={link} className="mt-2 h-[10px]" />
        <AudioTransport link={link} playRef={playRef} className="mt-4 h-[46px] gap-3.5" />
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
        loading="lazy"
        decoding="async"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full object-cover"
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return <AudioHeroIcon />;
}

/** The hero without art: the music icon at 48px on the muted tint. */
export function AudioHeroIcon({ children }: { children?: ReactNode }) {
  return (
    <div
      data-hero="icon"
      className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
    >
      {children ?? <MusicNote aria-hidden className="size-12" />}
    </div>
  );
}

/**
 * The times under the track: the elapsed at the left and the length at the
 * right, 11px tabular, `text-foreground/70`. Plain text, not a live region:
 * the track's value says the same.
 */
export function AudioTimes({
  link,
  className,
  ...rest
}: ComponentPropsWithoutRef<"div"> & { link: Link }) {
  const { elapsed, length } = useAudioPlayer(link.id, link.duration);
  return (
    <div
      data-times=""
      className={cn(
        "flex items-center justify-between text-[11px] leading-none text-foreground/70 tabular-nums",
        className,
      )}
      {...rest}
    >
      <span data-elapsed="">{formatDuration(elapsed)}</span>
      <span data-length="">{length ? formatDuration(length) : null}</span>
    </div>
  );
}

/** The transport's side buttons (Restart, Open file): 34px, outlined, 44px to the touch. */
const SIDE_BUTTON =
  "relative flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-foreground/70 outline-none transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-[5px]";

/**
 * The player's transport, centred: Restart (34px, outlined; off at the
 * start while paused), Play/Pause (46px, the drawn mark at 18px) and Open
 * file (34px, a real link to the file). Clicks stay in it
 * (`keepAudioClick`): never the card's or the row's.
 */
export function AudioTransport({
  link,
  playRef,
  className,
  ...rest
}: ComponentPropsWithoutRef<"div"> & { link: Link; playRef?: Ref<HTMLButtonElement> }) {
  const { playing, elapsed, toggle, restart } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  const src = safeRemoteImgSrc(link.url);
  return (
    <div
      data-transport=""
      className={cn("flex items-center justify-center", className)}
      {...rest}
    >
      <button
        type="button"
        disabled={!src || (elapsed === 0 && !playing)}
        aria-label={`Restart ${link.title}`}
        className={SIDE_BUTTON}
        onClick={(event) => {
          keepAudioClick(event);
          restart();
        }}
      >
        <Restart className="size-4" aria-hidden />
      </button>
      <button
        ref={playRef}
        type="button"
        data-play=""
        disabled={!src}
        aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
        className="flex size-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background outline-none transition-[scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100"
        onClick={(event) => {
          keepAudioClick(event);
          if (src) toggle(src);
        }}
      >
        <PlayMark playing={playing} size={18} reducedMotion={reducedMotion} />
      </button>
      {/* A real link, like the row menu's item: Cmd/Ctrl-click and the
          browser's own link handling work as on any link. */}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open file"
        className={SIDE_BUTTON}
        onClick={(event) => event.stopPropagation()}
      >
        <Export5 className="size-4" aria-hidden />
      </a>
    </div>
  );
}

/**
 * The track: a 3px rail with the played run, and a transparent range over
 * it (16px tall, 44px to the touch) that seeks, keyboard-operable; its
 * focus rings the rail.
 */
export function AudioTrack({ link }: { link: Link }) {
  const { elapsed, length, failed, seek } = useAudioPlayer(link.id, link.duration);
  const src = safeRemoteImgSrc(link.url);
  const time = length
    ? `${formatDuration(elapsed)} / ${formatDuration(length)}`
    : formatDuration(elapsed);
  const played = length ? Math.min(1, Math.max(0, elapsed / length)) : 0;

  return (
    <div className="relative h-[3px] rounded-full bg-foreground/12 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring">
      <div
        data-run=""
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
        style={{ width: `${played * 100}%` }}
      />
      <input
        type="range"
        min={0}
        max={length ?? 0}
        step="any"
        value={Math.min(elapsed, length ?? 0)}
        // A file that failed stays put until its play is pressed again.
        disabled={!src || !length || failed}
        aria-label={`Seek ${link.title}`}
        aria-valuetext={time}
        className="absolute inset-x-0 top-1/2 m-0 h-4 w-full -translate-y-1/2 cursor-pointer appearance-none opacity-0 disabled:cursor-default pointer-coarse:h-11"
        onChange={(event) => {
          if (src) seek(src, Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}
