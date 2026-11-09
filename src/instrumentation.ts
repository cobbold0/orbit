export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundNotificationWorker } = await import(
      "@/lib/background/background-worker"
    );
    startBackgroundNotificationWorker();
  }
}
