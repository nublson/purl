"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

/** What the page's one `<audio>` element is doing. */
export type AudioSnapshot = {
  /** The pearl loaded in the element (playing or paused), else null. */
  id: string | null;
  playing: boolean;
  /** Seconds. */
  elapsed: number;
  /** Seconds, once the element knows the file's metadata. */
  length: number | null;
  /** The last load errored; cleared by the next toggle. */
  failed: boolean;
};

/** The parts of `<audio>` the store uses (tests pass a fake). */
export type AudioElementLike = Pick<
  HTMLAudioElement,
  | "play"
  | "pause"
  | "src"
  | "currentTime"
  | "duration"
  | "preload"
  | "addEventListener"
  | "removeEventListener"
>;

export interface AudioPlayerStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AudioSnapshot;
  /**
   * Another pearl (or none) loaded: load `src` and play it from 0. This
   * pearl playing: pause it (it stays loaded, at its elapsed). This pearl
   * paused: resume.
   */
  toggle(id: string, src: string): void;
  /** If `id` is loaded: pause and go idle (elapsed 0). */
  stop(id: string): void;
  /** Moves the loaded pearl to `seconds`; nothing while idle. */
  seek(seconds: number): void;
  /** Back to 0, still playing or paused as it was. */
  restart(): void;
  /**
   * A view of pearl `id` mounted; returns its detach. When the last view
   * of the loaded pearl detaches (deleted, moved out, the page left), it
   * stops, so it never plays on with nothing showing it.
   */
  attach(id: string): () => void;
}

const IDLE: AudioSnapshot = {
  id: null,
  playing: false,
  elapsed: 0,
  length: null,
  failed: false,
};

function readLength(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * The page's audio player: one element for every audio pearl, so one plays
 * at a time by construction, and a pearl's card and its opened player are
 * two views of the same playback (opening a playing pearl doesn't restart
 * it). The element is made by `createElement` on the first `toggle`.
 */
export function createAudioPlayerStore(
  createElement: () => AudioElementLike,
): AudioPlayerStore {
  let element: AudioElementLike | null = null;
  let state: AudioSnapshot = IDLE;
  const listeners = new Set<() => void>();
  const views = new Map<string, number>();
  // Bumped on each load, so a late answer from an earlier `play()` is ignored.
  let load = 0;
  // `pause` events still to come from our own `pause()` calls: those aren't
  // a pause from outside. A new load drops the element's queued events, so
  // it resets the count.
  let ownPauses = 0;

  function set(next: Partial<AudioSnapshot>) {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  }

  function pauseElement() {
    if (!element) return;
    if (state.playing) ownPauses += 1;
    element.pause();
  }

  function goIdle(failed: boolean) {
    if (!element) return;
    pauseElement();
    element.currentTime = 0;
    state = { ...IDLE, failed };
    for (const listener of [...listeners]) listener();
  }

  function play(id: string) {
    if (!element) return;
    const token = load;
    element.play().catch((error: unknown) => {
      // A pause() or a new load that cut the play short isn't a failure.
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      if (token !== load || state.id !== id) return;
      // The element never started, so no pause event of ours is coming.
      state = { ...state, playing: false };
      goIdle(true);
    });
  }

  function ensureElement(): AudioElementLike {
    if (element) return element;
    const audio = createElement();
    audio.preload = "none";
    audio.addEventListener("timeupdate", () => {
      if (state.id === null || state.elapsed === audio.currentTime) return;
      set({ elapsed: audio.currentTime });
    });
    const onLength = () => {
      const length = readLength(audio.duration);
      if (state.id === null || length === null || length === state.length) return;
      set({ length });
    };
    audio.addEventListener("loadedmetadata", onLength);
    audio.addEventListener("durationchange", onLength);
    audio.addEventListener("pause", () => {
      if (ownPauses > 0) {
        ownPauses -= 1;
        return;
      }
      // Paused from outside (media keys, the OS taking audio focus): the
      // pearl stays loaded where it was.
      if (state.id !== null && state.playing) set({ playing: false });
    });
    audio.addEventListener("ended", () => {
      if (state.id !== null) goIdle(false);
    });
    audio.addEventListener("error", () => {
      if (state.id === null) return;
      state = { ...state, playing: false };
      goIdle(true);
    });
    element = audio;
    return audio;
  }

  const store: AudioPlayerStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return state;
    },
    toggle(id, src) {
      const audio = ensureElement();
      if (state.id === id) {
        if (state.playing) {
          pauseElement();
          set({ playing: false });
        } else {
          set({ playing: true, failed: false });
          play(id);
        }
        return;
      }
      // Loading a new file pauses the element and drops its queued events.
      load += 1;
      ownPauses = 0;
      audio.src = src;
      audio.currentTime = 0;
      state = { id, playing: true, elapsed: 0, length: null, failed: false };
      for (const listener of [...listeners]) listener();
      play(id);
    },
    stop(id) {
      if (state.id !== id) return;
      goIdle(false);
    },
    seek(seconds) {
      if (!element || state.id === null) return;
      element.currentTime = seconds;
      set({ elapsed: seconds });
    },
    restart() {
      store.seek(0);
    },
    attach(id) {
      views.set(id, (views.get(id) ?? 0) + 1);
      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        const left = (views.get(id) ?? 1) - 1;
        if (left > 0) {
          views.set(id, left);
          return;
        }
        views.delete(id);
        store.stop(id);
      };
    },
  };
  return store;
}

/**
 * The page's one player. Its `<audio>` is made on the first play (never on
 * the server) and kept in the document, without controls, for the page's
 * life.
 */
export const audioPlayerStore = createAudioPlayerStore(() => {
  const audio = document.createElement("audio");
  document.body.append(audio);
  return audio;
});

/** One pearl's view of the player, without the actions. */
export type AudioPlayerView = {
  /** This pearl is the one loaded (playing or paused). */
  active: boolean;
  playing: boolean;
  /** Seconds. */
  elapsed: number;
  /** Seconds: the element's once it knows, else the stored one. */
  length: number | null;
  failed: boolean;
};

/** What pearl `id` reads from the player's snapshot. */
export function snapshotFor(
  id: string,
  snapshot: AudioSnapshot,
  fallbackLength: number | null,
): AudioPlayerView {
  const active = snapshot.id === id;
  return {
    active,
    playing: active && snapshot.playing,
    elapsed: active ? snapshot.elapsed : 0,
    length: active && snapshot.length != null ? snapshot.length : fallbackLength,
    failed: active && snapshot.failed,
  };
}

function sameView(a: AudioPlayerView, b: AudioPlayerView): boolean {
  return (
    a.active === b.active &&
    a.playing === b.playing &&
    a.elapsed === b.elapsed &&
    a.length === b.length &&
    a.failed === b.failed
  );
}

/**
 * Reads pearl `id`'s view, returning the same object until it changes, so
 * `useSyncExternalStore` re-renders a view only when its own reading does.
 */
function viewReader(
  id: string,
  fallbackLength: number | null,
): (snapshot: AudioSnapshot) => AudioPlayerView {
  let last: AudioPlayerView | null = null;
  return (snapshot) => {
    const next = snapshotFor(id, snapshot, fallbackLength);
    if (last && sameView(last, next)) return last;
    last = next;
    return next;
  };
}

/**
 * Pearl `id`'s view of the page's player (a card's bar, the viewer's
 * player). Mounted views keep the pearl playing; when its last one goes,
 * it stops. Only views whose own reading changed re-render (another pearl's
 * `timeupdate` doesn't).
 */
export function useAudioPlayer(
  id: string,
  fallbackLength: number | null,
): AudioPlayerView & {
  toggle: (src: string) => void;
  seek: (seconds: number) => void;
  restart: () => void;
} {
  const read = useMemo(() => viewReader(id, fallbackLength), [id, fallbackLength]);
  const view = useSyncExternalStore(
    audioPlayerStore.subscribe,
    () => read(audioPlayerStore.getSnapshot()),
    () => read(IDLE),
  );

  useEffect(() => audioPlayerStore.attach(id), [id]);

  const toggle = useCallback((src: string) => audioPlayerStore.toggle(id, src), [id]);
  const seek = useCallback((seconds: number) => audioPlayerStore.seek(seconds), []);
  const restart = useCallback(() => audioPlayerStore.restart(), []);
  return { ...view, toggle, seek, restart };
}
