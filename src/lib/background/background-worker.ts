import { evaluateDueBackgroundJobs } from "@/modules/notifications/notification-service";

declare global {
  var __orbitNotificationWorkerStarted: boolean | undefined;
}

/**
 * Runs a server-side timer to evaluate due background jobs and dispatch Web Push notifications
 * even when no client browser tab is actively navigating.
 */
export function startBackgroundNotificationWorker() {
  if (global.__orbitNotificationWorkerStarted) {
    return;
  }
  global.__orbitNotificationWorkerStarted = true;

  // Run initial sweep 3 seconds after server startup
  setTimeout(async () => {
    try {
      await evaluateDueBackgroundJobs({ limit: 50 });
    } catch {
      // Non-fatal on startup
    }
  }, 3000);

  // Periodic sweep every 25 seconds
  setInterval(async () => {
    try {
      await evaluateDueBackgroundJobs({ limit: 50 });
    } catch {
      // Non-fatal on interval
    }
  }, 25_000);
}
