import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Runs a Vercel cron job inside a Sentry Cron Monitor check-in.
 *
 * The check-in is sent from the handler itself (not from the request span,
 * as `_experimental.vercelCronsMonitoring` did: on cold starts that sent no
 * check-in at all, so every cold run read as missed). The monitor's config
 * lives here, so it is upserted with every check-in and can't drift:
 * `failureIssueThreshold: 2` means one missed or failed run alone opens no
 * issue, two in a row do. `schedule` must match the cron in `vercel.json`.
 * The slug is the monitor's existing one, so its history carries over.
 */
export async function runMonitoredCron<T>(
  monitorSlug: string,
  schedule: string,
  job: () => Promise<T>,
): Promise<T> {
  try {
    return await Sentry.withMonitor(monitorSlug, job, {
      schedule: { type: "crontab", value: schedule },
      checkinMargin: 1,
      // Both routes have `maxDuration = 120`; minutes.
      maxRuntime: 3,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    });
  } finally {
    // The function can be frozen once it answers: send the check-in first.
    await Sentry.flush(2000);
  }
}
