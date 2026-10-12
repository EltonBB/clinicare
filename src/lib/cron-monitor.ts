import * as Sentry from "@sentry/nextjs";

import vercelConfig from "../../vercel.json";

/**
 * Report an authorized cron run to Sentry Crons, so a run that fails, hangs or
 * never fires (a broken schedule, a rotated CRON_SECRET) raises an alert
 * instead of failing silently. The schedule comes from vercel.json, so the two
 * can't drift. Explicit check-ins rather than the SDK's span-based option:
 * that one only completes on sampled spans, and servers sample 10%.
 * A no-op when SENTRY_DSN is unset.
 */
export async function withCronMonitor(path: string, run: () => Promise<Response>): Promise<Response> {
  const schedule = vercelConfig.crons.find((cron) => cron.path === path)!.schedule;
  const monitorSlug = path.replace(/^\/api\/cron\//, "cron-");
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug, status: "in_progress" },
    { schedule: { type: "crontab", value: schedule }, timezone: "UTC", checkinMargin: 5, maxRuntime: 10 }
  );

  try {
    const response = await run();
    Sentry.captureCheckIn({ checkInId, monitorSlug, status: response.status >= 500 ? "error" : "ok" });
    return response;
  } catch (error) {
    Sentry.captureCheckIn({ checkInId, monitorSlug, status: "error" });
    throw error;
  } finally {
    await Sentry.flush(2_000);
  }
}
