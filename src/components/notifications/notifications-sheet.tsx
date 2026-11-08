"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  dismissNotificationAction,
  getRecentCheckInsAction,
} from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

interface CheckInNotificationItem {
  id: string;
  title: string;
  body: string;
  actionUrl: string;
  status: string;
  responseValue?: string | null;
  createdAt: string;
}

export function NotificationsSheet({
  unreadCount = 0,
  isDesktop = false,
}: {
  unreadCount?: number;
  isDesktop?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<CheckInNotificationItem[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const { notify } = useOrbitToast();

  const loadNotifications = React.useCallback(async () => {
    setLoading(true);
    try {
      const items = await getRecentCheckInsAction();
      setNotifications(items);
    } catch {
      notify("Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (isOpen) {
      void loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  async function handleDismiss(id: string) {
    setDismissingId(id);
    try {
      const fd = new FormData();
      fd.append("notificationId", id);
      await dismissNotificationAction(fd);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: "DISMISSED" } : n))
      );
      notify("Check-in dismissed");
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <>
      {isDesktop ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-base-content/80 hover:bg-base-200/60 hover:text-base-content transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Bell className="h-4 w-4 text-base-content/70" />
            <span>Notifications</span>
          </div>
          {unreadCount > 0 && (
            <span className="badge badge-secondary badge-xs font-semibold tabular">
              {unreadCount}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="View notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-base-200/70 text-base-content/75 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[0.625rem] font-bold text-secondary-content">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="max-w-xl mx-auto sm:rounded-t-3xl max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-base-content">
              <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>Notifications</span>
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-base-content/50">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl bg-base-200/40 border border-base-300/50">
              <CheckCircle2 className="h-8 w-8 text-success/60 mb-2" />
              <p className="text-sm font-semibold text-base-content">
                All caught up
              </p>
              <p className="text-xs text-base-content/60 mt-1 max-w-xs">
                No new notifications. Orbit will alert you when you finish focus blocks or routines.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((notif) => {
                const isPending = notif.status === "DELIVERED";
                const isDismissing = dismissingId === notif.id;

                return (
                  <div
                    key={notif.id}
                    className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl border transition-all ${
                      isPending
                        ? "bg-primary/5 border-primary/20 shadow-xs"
                        : "bg-base-100 border-base-200/80 opacity-75"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge badge-xs font-semibold ${
                            isPending
                              ? "badge-secondary"
                              : "badge-ghost text-base-content/50"
                          }`}
                        >
                          {isPending ? "Action needed" : notif.status.toLowerCase()}
                        </span>
                        <p className="text-sm font-semibold text-base-content truncate">
                          {notif.title}
                        </p>
                      </div>

                      <p className="text-xs text-base-content/80 leading-relaxed">
                        {notif.body}
                      </p>

                      {notif.responseValue && (
                        <p className="text-xs text-success font-medium flex items-center gap-1 pt-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Responded: {notif.responseValue}</span>
                        </p>
                      )}

                      {isPending && notif.actionUrl && (
                        <div className="pt-2 flex items-center gap-2">
                          <Link
                            href={notif.actionUrl}
                            onClick={() => setIsOpen(false)}
                            className="btn btn-primary btn-xs gap-1.5"
                          >
                            <span>Answer check-in</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          <button
                            type="button"
                            disabled={isDismissing}
                            onClick={() => void handleDismiss(notif.id)}
                            className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
                          >
                            {isDismissing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Dismiss"
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {!isPending && (
                      <button
                        type="button"
                        disabled={isDismissing}
                        onClick={() => void handleDismiss(notif.id)}
                        aria-label="Dismiss notification"
                        className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-base-content"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
