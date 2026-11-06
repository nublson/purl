/**
 * A setting shown at once and saved in the background, one save at a time,
 * always the latest choice: a quick back-and-forth can't leave an older value
 * stored (two requests landing out of order). A failed save goes back to the
 * last confirmed value and reports which change didn't stick.
 */
export function createLatestSaver<T>({
  confirmed: initial,
  save,
  onRevert,
}: {
  /** The value the server has now. */
  confirmed: T;
  /** Stores `value`; rejects when it didn't. */
  save: (value: T) => Promise<void>;
  /** A save failed: show `confirmed` again; `failed` is the lost choice. */
  onRevert: (confirmed: T, failed: T) => void;
}): {
  set(value: T): void;
  confirmed(): T;
  /** No save in flight: `confirmed` may be stale against the server by now. */
  idle(): boolean;
} {
  let confirmed = initial;
  let latest = initial;
  let saving = false;

  async function flush() {
    if (saving) return;
    saving = true;
    try {
      while (latest !== confirmed) {
        const target = latest;
        try {
          await save(target);
          confirmed = target;
        } catch {
          latest = confirmed;
          onRevert(confirmed, target);
          return;
        }
      }
    } finally {
      saving = false;
    }
  }

  return {
    set(value: T) {
      latest = value;
      void flush();
    },
    confirmed: () => confirmed,
    idle: () => !saving,
  };
}
