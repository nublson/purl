import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  withMonitor: vi.fn((_slug: string, job: () => unknown) => job()),
  flush: vi.fn(async () => true),
}));

const Sentry = await import("@sentry/nextjs");
const { runMonitoredCron } = await import("./cron-monitor");

describe("runMonitoredCron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks in with a config that tolerates one missed run, then flushes", async () => {
    await expect(
      runMonitoredCron("apicronenrich-links", "* * * * *", async () => 7),
    ).resolves.toBe(7);
    expect(Sentry.withMonitor).toHaveBeenCalledWith(
      "apicronenrich-links",
      expect.any(Function),
      {
        schedule: { type: "crontab", value: "* * * * *" },
        checkinMargin: 1,
        maxRuntime: 3,
        failureIssueThreshold: 2,
        recoveryThreshold: 1,
      },
    );
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
  });

  it("still flushes the check-in when the job throws", async () => {
    await expect(
      runMonitoredCron("apicronsweep-uploads", "0 * * * *", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
  });
});
