"use client";

import { useEffect, useRef } from "react";
import { syncAndCheckNotificationsAction } from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface NotificationSyncProps {
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationSync({ onUnreadCountChange }: NotificationSyncProps) {
  const { notify } = useOrbitToast();
  const lastDeliveredRef = useRef<string>(new Date().toISOString());
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    async function checkNotifications() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      try {
        const result = await syncAndCheckNotificationsAction(lastDeliveredRef.current);
        if (!isMounted) return;

        if (typeof result.unreadCount === "number") {
          onUnreadCountChange?.(result.unreadCount);
        }

        if (result.newlyDelivered && result.newlyDelivered.length > 0) {
          for (const item of result.newlyDelivered) {
            if (seenIdsRef.current.has(item.id)) continue;
            seenIdsRef.current.add(item.id);
            lastDeliveredRef.current = item.createdAt;

            // In-app alert
            notify(`🔔 ${item.title} — ${item.body}`);

            // Haptic feedback if available on mobile
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try {
                navigator.vibrate([100, 50, 100]);
              } catch {
                // Ignore unsupported vibration
              }
            }
          }
        }
      } catch {
        // Non-fatal background sync failure
      }
    }

    // Initial check after 3 seconds of page load
    const initialTimer = setTimeout(() => {
      void checkNotifications();
    }, 3000);

    // Periodic sweep every 25 seconds
    const interval = setInterval(() => {
      void checkNotifications();
    }, 25_000);

    // Immediate check on tab focus
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkNotifications();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [notify, onUnreadCountChange]);

  return null;
}
