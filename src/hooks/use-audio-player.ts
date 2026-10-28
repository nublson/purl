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
  /** The last load errored; cleared by the next toggle or seek. */
  failed: boolean;
  /**
   * The pearl whose last load errored (the snapshot is idle by then, so
   * `id` no longer names it); cleared by the next toggle or seek.
   */
  failedId: string | null;
};

/** The parts of `<audio>` the store uses (tests pass a fake). */
export type AudioElementLike = Pick<
  HTMLAudioElement,
  | "play"
  | "pause"
  | "src"
  | "currentTime"
  | "duration"
  | "paused"
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
  /**
   * Moves pearl `id` to `seconds`. The loaded pearl moves as it plays (or
   * stays paused). Another pearl is loaded from `src`, paused, and starts
   * from there when toggled; with one element, that unloads (stops) the
   * pearl that was loaded.
   */
  seek(id: string, src: string, seconds: number): void;
  /** Pearl `id` back to 0, still playing or paused, if it's the loaded one. */
  restart(id: string): void;
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
  failedId: null,
};

function readLength(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * The page's audio player: one element for every audio pearl, so one plays
 * at a time by construction, and a pearl's card and its opened player are
 * two views of the same playback (opening a playing pearl doesn't restart
 * it). The element is made by `createElement` on the first toggle or seek.
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
  // A seek on a pearl that wasn't loaded: the time to move to once the
  // element knows the file's length (clamped to it).
  let pendingSeek: number | null = null;

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function set(next: Partial<AudioSnapshot>) {
    state = { ...state, ...next };
    notify();
  }

  function pauseElement() {
    if (!element) return;
    if (state.playing) ownPauses += 1;
    element.pause();
  }

  function goIdle(failedId: string | null) {
    if (!element) return;
    pauseElement();
    pendingSeek = null;
    element.currentTime = 0;
    state = { ...IDLE, failed: failedId !== null, failedId };
    notify();
  }

  /** The element errored on the loaded pearl: idle, remembering which. */
  function fail() {
    const failedId = state.id;
    // The element isn't playing, so no pause event of ours is coming.
    state = { ...state, playing: false };
    goIdle(failedId);
  }

  function play(id: string) {
    if (!element) return;
    const token = load;
    element.play().catch((error: unknown) => {
      // A pause() or a new load that cut the play short isn't a failure.
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      if (token !== load || state.id !== id) return;
      fail();
    });
  }

  /** Loads `src` as pearl `id`; the element pauses and drops queued events. */
  function loadSource(audio: AudioElementLike, src: string, preload: "none" | "metadata") {
    load += 1;
    ownPauses = 0;
    pendingSeek = null;
    audio.preload = preload;
    audio.src = src;
  }

  function ensureElement(): AudioElementLike {
    if (element) return element;
    const audio = createElement();
    audio.preload = "none";
    audio.addEventListener("timeupdate", () => {
      if (state.id === null || pendingSeek !== null) return;
      if (state.elapsed === audio.currentTime) return;
      set({ elapsed: audio.currentTime });
    });
    const onLength = () => {
      if (state.id === null) return;
      const length = readLength(audio.duration);
      const next: Partial<AudioSnapshot> = {};
      if (length !== null && length !== state.length) next.length = length;
      if (pendingSeek !== null && length !== null) {
        const time = Math.min(pendingSeek, length);
        pendingSeek = null;
        audio.currentTime = time;
        next.elapsed = time;
      }
      if (Object.keys(next).length > 0) set(next);
    };
    audio.addEventListener("loadedmetadata", onLength);
    audio.addEventListener("durationchange", onLength);
    audio.addEventListener("pause", () => {
      const ours = ownPauses > 0;
      if (ours) ownPauses -= 1;
      // An event from a pause that's over (the pearl resumed, or another
      // file loaded since) or one of our own: nothing to follow.
      if (!audio.paused || ours) return;
      // Paused from outside (media keys, the OS taking audio focus): the
      // pearl stays loaded where it was.
      if (state.id !== null && state.playing) set({ playing: false });
    });
    audio.addEventListener("ended", () => {
      if (state.id !== null) goIdle(null);
    });
    audio.addEventListener("error", () => {
      if (state.id !== null) fail();
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
          set({ playing: false, failed: false, failedId: null });
        } else {
          // A seek made before the length was known stops waiting for it:
          // the element already holds the time, and a stream whose length
          // never becomes finite would otherwise keep `timeupdate` ignored
          // (elapsed frozen) for as long as it plays.
          if (pendingSeek !== null) {
            audio.currentTime = pendingSeek;
            pendingSeek = null;
          }
          set({ playing: true, failed: false, failedId: null });
          play(id);
        }
        return;
      }
      loadSource(audio, src, "none");
      audio.currentTime = 0;
      state = { ...IDLE, id, playing: true };
      notify();
      play(id);
    },
    stop(id) {
      if (state.id !== id) return;
      goIdle(null);
    },
    seek(id, src, seconds) {
      const audio = ensureElement();
      if (state.id === id) {
        // Before the length is known, the time waits for it.
        if (pendingSeek !== null) pendingSeek = seconds;
        audio.currentTime = seconds;
        set({ elapsed: seconds, failed: false, failedId: null });
        return;
      }
      // Another pearl: load it paused, just far enough to know its length,
      // then move to the time (a later toggle plays from there).
      loadSource(audio, src, "metadata");
      pendingSeek = seconds;
      audio.currentTime = seconds;
      state = { ...IDLE, id, elapsed: seconds };
      notify();
    },
    restart(id) {
      if (state.id !== id || !element) return;
      if (pendingSeek !== null) pendingSeek = 0;
      element.currentTime = 0;
      set({ elapsed: 0 });
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
        // A view swapped for another in the same commit (the old one's
        // cleanup runs before the new one attaches) keeps it playing: stop
        // only if no view of it came back.
        queueMicrotask(() => {
          if (!views.has(id)) store.stop(id);
        });
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
    failed: snapshot.failedId === id,
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
  /** Moves this pearl to `seconds`, loading it (paused) if it isn't. */
  seek: (src: string, seconds: number) => void;
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
  const seek = useCallback(
    (src: string, seconds: number) => audioPlayerStore.seek(id, src, seconds),
    [id],
  );
  const restart = useCallback(() => audioPlayerStore.restart(id), [id]);
  return { ...view, toggle, seek, restart };
}

/**
 * Holds pearl `id` as a view without reading the player (an audio pearl's
 * list row, whose hover preview plays it): a playing pearl keeps playing
 * while its row is on the page, after the preview closes. Null: no view.
 */
export function useAudioView(id: string | null): void {
  useEffect(() => (id === null ? undefined : audioPlayerStore.attach(id)), [id]);
}
