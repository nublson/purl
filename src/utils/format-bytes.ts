const KB = 1024;
const MB = 1024 * 1024;

/** "0 KB", "640 KB", "2.5 MB", "120 MB": whole KB below 1 MB, one decimal of MB below 10 MB, whole MB above. */
export function formatBytes(n: number): string {
  if (n < MB) return `${Math.round(Math.max(0, n) / KB)} KB`;
  const mb = n / MB;
  if (mb < 9.95) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}
